#include "c37118_decoder.h"
#include <cstring>
#include <cmath>
#include <chrono>
#include <algorithm>
#include <iostream>

namespace pmu {

C37118Decoder::C37118Decoder() = default;
C37118Decoder::~C37118Decoder() = default;

bool C37118Decoder::detect_byte_order(const uint8_t* data, size_t length, ByteOrder& order) {
    if (length < 2) return false;

    uint16_t sync_be = (static_cast<uint16_t>(data[0]) << 8) | static_cast<uint16_t>(data[1]);
    uint16_t sync_le = (static_cast<uint16_t>(data[1]) << 8) | static_cast<uint16_t>(data[0]);

    if ((sync_be & SYNC_MAGIC_MASK) == SYNC_MAGIC_BE) {
        order = BYTE_ORDER_BIG_ENDIAN;
        return true;
    }
    if ((sync_le & SYNC_MAGIC_MASK) == SYNC_MAGIC_BE) {
        order = BYTE_ORDER_LITTLE_ENDIAN;
        return true;
    }

    return false;
}

ByteOrder C37118Decoder::get_pmu_byte_order(uint16_t pmu_id) const {
    std::lock_guard<std::mutex> lock(byte_order_mutex_);
    auto it = pmu_byte_orders_.find(pmu_id);
    return it != pmu_byte_orders_.end() ? it->second : BYTE_ORDER_UNKNOWN;
}

void C37118Decoder::set_pmu_byte_order(uint16_t pmu_id, ByteOrder order) {
    std::lock_guard<std::mutex> lock(byte_order_mutex_);
    pmu_byte_orders_[pmu_id] = order;
}

uint16_t C37118Decoder::decode_uint16(const uint8_t* data, ByteOrder order) {
    if (order == BYTE_ORDER_LITTLE_ENDIAN) {
        return (static_cast<uint16_t>(data[1]) << 8) |
               static_cast<uint16_t>(data[0]);
    }
    return (static_cast<uint16_t>(data[0]) << 8) |
           static_cast<uint16_t>(data[1]);
}

uint32_t C37118Decoder::decode_uint32(const uint8_t* data, ByteOrder order) {
    if (order == BYTE_ORDER_LITTLE_ENDIAN) {
        return (static_cast<uint32_t>(data[3]) << 24) |
               (static_cast<uint32_t>(data[2]) << 16) |
               (static_cast<uint32_t>(data[1]) << 8) |
               static_cast<uint32_t>(data[0]);
    }
    return (static_cast<uint32_t>(data[0]) << 24) |
           (static_cast<uint32_t>(data[1]) << 16) |
           (static_cast<uint32_t>(data[2]) << 8) |
           static_cast<uint32_t>(data[3]);
}

double C37118Decoder::decode_ieee_single(const uint8_t* data, ByteOrder order) {
    uint32_t raw = decode_uint32(data, order);

    if (raw == 0 || raw == 0x80000000) {
        return 0.0;
    }

    uint32_t sign = (raw >> 31) & 0x1;
    uint32_t exponent = (raw >> 23) & 0xFF;
    uint32_t mantissa = raw & 0x7FFFFF;

    if (exponent == 0xFF) {
        return 0.0;
    }

    if (exponent == 0 && mantissa == 0) {
        return 0.0;
    }

    if (exponent > 200 || exponent < 50) {
        return 0.0;
    }

    float value;
    if (order == BYTE_ORDER_LITTLE_ENDIAN) {
        uint8_t swapped[4];
        swapped[0] = data[3];
        swapped[1] = data[2];
        swapped[2] = data[1];
        swapped[3] = data[0];
        std::memcpy(&value, swapped, sizeof(float));
    } else {
        std::memcpy(&value, data, sizeof(float));
    }

    if (std::isnan(value) || std::isinf(value)) {
        return 0.0;
    }

    return static_cast<double>(value);
}

double C37118Decoder::clamp_value(double value, double min_val, double max_val, const char* name) {
    if (std::isnan(value) || std::isinf(value)) {
        std::cerr << "[C37118] " << name << " is NaN/Inf, clamped to 0" << std::endl;
        return 0.0;
    }
    if (value > max_val || value < min_val) {
        std::cerr << "[C37118] " << name << " out of range: " << value
                  << " (expected [" << min_val << ", " << max_val << "])" << std::endl;
        return std::max(min_val, std::min(max_val, value));
    }
    return value;
}

bool C37118Decoder::validate_phasor_data(const PhasorData& data, const PMUConfig& cfg) {
    if (data.frequency < 10.0 || data.frequency > 400.0) {
        std::cerr << "[C37118] PMU " << cfg.pmu_id << " invalid frequency: " << data.frequency << std::endl;
        return false;
    }

    for (size_t i = 0; i < data.phasors.size(); ++i) {
        const auto& ph = data.phasors[i];
        double nominal = i < cfg.phasor_nominals.size() ? cfg.phasor_nominals[i] : (ph.is_voltage ? 220.0 : 100.0);
        double max_mag = nominal * 10.0;

        if (std::isnan(ph.magnitude) || std::isinf(ph.magnitude)) {
            std::cerr << "[C37118] PMU " << cfg.pmu_id << " phasor " << i << " magnitude NaN/Inf" << std::endl;
            return false;
        }
        if (ph.magnitude > max_mag * 100) {
            std::cerr << "[C37118] PMU " << cfg.pmu_id << " phasor " << i
                      << " magnitude overflow: " << ph.magnitude << " (nominal " << nominal << ")" << std::endl;
            return false;
        }
        if (std::isnan(ph.angle) || std::isinf(ph.angle)) {
            std::cerr << "[C37118] PMU " << cfg.pmu_id << " phasor " << i << " angle NaN/Inf" << std::endl;
            return false;
        }
    }
    return true;
}

uint64_t C37118Decoder::decode_timestamp(uint32_t soc, uint32_t fracsec, uint32_t time_base) {
    uint64_t epoch_ms = static_cast<uint64_t>(soc) * 1000;
    if (time_base == 0) time_base = 1000000;
    uint32_t frac = fracsec & 0x00FFFFFF;
    double frac_ms = (static_cast<double>(frac) / static_cast<double>(time_base)) * 1000.0;
    return epoch_ms + static_cast<uint64_t>(frac_ms);
}

bool C37118Decoder::decode(const uint8_t* data, size_t length, PhasorData& output) {
    if (length < 6) return false;

    ByteOrder detected_order;
    if (!detect_byte_order(data, length, detected_order)) {
        return false;
    }

    uint16_t sync = decode_uint16(data, detected_order);
    uint16_t frame_size = decode_uint16(data + 2, detected_order);
    uint16_t id_code = decode_uint16(data + 4, detected_order);
    uint16_t frame_type = (sync >> 4) & 0x000F;

    if (frame_size > length || frame_size < 6) return false;

    ByteOrder pmu_order = get_pmu_byte_order(id_code);
    if (pmu_order == BYTE_ORDER_UNKNOWN) {
        set_pmu_byte_order(id_code, detected_order);
        pmu_order = detected_order;
    } else if (pmu_order != detected_order) {
        set_pmu_byte_order(id_code, detected_order);
        pmu_order = detected_order;
    }

    output.pmu_id = id_code;

    switch (frame_type) {
        case DATA_FRAME:
            return decode_data_frame(data, length, output, pmu_order);
        case CFG1_FRAME:
        case CFG2_FRAME:
        case CFG3_FRAME: {
            PMUConfig config;
            if (decode_cfg_frame(data, length, config, pmu_order)) {
                register_config(config);
            }
            return false;
        }
        case HEADER_FRAME:
            return decode_header_frame(data, length, pmu_order);
        default:
            return false;
    }
}

bool C37118Decoder::decode_data_frame(const uint8_t* data, size_t length, PhasorData& output, ByteOrder order) {
    std::lock_guard<std::mutex> lock(config_mutex_);

    size_t offset = 6;
    if (offset + 8 > length) return false;

    uint32_t soc = decode_uint32(data + offset, order);
    offset += 4;
    uint32_t fracsec = decode_uint32(data + offset, order);
    offset += 4;

    auto cfg_it = configs_.find(output.pmu_id);
    if (cfg_it == configs_.end()) {
        return false;
    }

    const PMUConfig& cfg = cfg_it->second;
    uint32_t time_base = cfg.time_base > 0 ? cfg.time_base : 1000000;

    output.timestamp = decode_timestamp(soc, fracsec, time_base);
    output.station_id = cfg.station_name;

    if (output.timestamp < 946684800000ULL || output.timestamp > 4102444800000ULL) {
        output.timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();
    }

    for (uint8_t i = 0; i < cfg.phasor_count; ++i) {
        if (offset + 8 > length) return false;
        Phasor phasor;
        phasor.name = i < cfg.phasor_names.size() ? cfg.phasor_names[i] : "PH" + std::to_string(i);
        phasor.is_voltage = i < cfg.phasor_is_voltage.size() ? cfg.phasor_is_voltage[i] : true;

        double nominal = i < cfg.phasor_nominals.size() ? cfg.phasor_nominals[i] : (phasor.is_voltage ? 220.0 : 100.0);
        double max_reasonable = nominal * 10.0;

        double real = decode_ieee_single(data + offset, order);
        offset += 4;
        double imag = decode_ieee_single(data + offset, order);
        offset += 4;

        real = clamp_value(real, -max_reasonable, max_reasonable, "phasor real");
        imag = clamp_value(imag, -max_reasonable, max_reasonable, "phasor imag");

        double mag_sq = real * real + imag * imag;
        if (mag_sq > (max_reasonable * max_reasonable) * 10000) {
            phasor.magnitude = 0.0;
            phasor.angle = 0.0;
        } else {
            phasor.magnitude = std::sqrt(mag_sq);
            phasor.angle = std::atan2(imag, real) * 180.0 / M_PI;
        }

        phasor.magnitude = clamp_value(phasor.magnitude, 0.0, max_reasonable * 5, "phasor magnitude");
        phasor.angle = clamp_value(phasor.angle, -360.0, 360.0, "phasor angle");

        output.phasors.push_back(phasor);
    }

    if (offset + 12 > length) return false;

    double freq_offset = decode_ieee_single(data + offset, order);
    offset += 4;
    output.frequency = 50.0 + clamp_value(freq_offset, -5.0, 5.0, "freq offset");

    output.freq_deviation = clamp_value(decode_ieee_single(data + offset, order), -5.0, 5.0, "freq deviation");
    offset += 4;

    output.rocof = clamp_value(decode_ieee_single(data + offset, order), -10.0, 10.0, "rocof");
    offset += 4;

    for (uint8_t i = 0; i < cfg.analog_count; ++i) {
        if (offset + 4 > length) break;
        double analog = decode_ieee_single(data + offset, order);
        output.analogs.push_back(clamp_value(analog, -10000.0, 10000.0, "analog"));
        offset += 4;
    }

    uint8_t digital_words = (cfg.digital_count + 15) / 16;
    for (uint8_t i = 0; i < digital_words; ++i) {
        if (offset + 2 > length) break;
        uint16_t digital = decode_uint16(data + offset, order);
        offset += 2;
        for (int b = 0; b < 16 && output.digitals.size() < cfg.digital_count; ++b) {
            output.digitals.push_back((digital >> (15 - b)) & 0x01);
        }
    }

    if (offset + 2 <= length) {
        output.data_quality = decode_uint16(data + offset, order);
        offset += 2;
    }

    if (!validate_phasor_data(output, cfg)) {
        output.phasors.clear();
        return false;
    }

    return true;
}

bool C37118Decoder::decode_cfg_frame(const uint8_t* data, size_t length, PMUConfig& config, ByteOrder order) {
    size_t offset = 6;
    if (offset + 8 > length) return false;
    offset += 8;

    if (offset + 2 > length) return false;
    config.pmu_id = decode_uint16(data + offset, order);
    offset += 2;

    if (offset + 16 > length) return false;
    char station_name[17];
    std::memcpy(station_name, data + offset, 16);
    station_name[16] = '\0';
    config.station_name = std::string(station_name);
    offset += 16;

    if (offset + 4 > length) return false;
    offset += 2;
    config.phasor_count = (data[offset] >> 4) & 0x0F;
    config.analog_count = data[offset] & 0x0F;
    uint8_t digital_count = data[offset + 1];
    uint8_t digital_word_count = (digital_count + 15) / 16;
    config.digital_count = digital_count;
    offset += 2;

    if (config.phasor_count > 32) config.phasor_count = 32;
    if (config.analog_count > 32) config.analog_count = 32;

    for (uint8_t i = 0; i < config.phasor_count; ++i) {
        if (offset + 20 > length) break;
        char name[17];
        std::memcpy(name, data + offset, 16);
        name[16] = '\0';
        config.phasor_names.push_back(std::string(name));
        offset += 16;

        uint8_t type_byte = data[offset];
        config.phasor_is_voltage.push_back((type_byte & 0x01) == 0);
        offset += 4;
    }

    for (uint8_t i = 0; i < config.analog_count; ++i) {
        if (offset + 16 > length) break;
        offset += 16;
    }

    for (uint8_t i = 0; i < digital_word_count; ++i) {
        if (offset + 16 > length) break;
        offset += 16;
    }

    if (offset + 8 > length) return false;
    offset += 4;
    config.time_base = decode_uint32(data + offset, order) & 0x00FFFFFF;
    if (config.time_base == 0) config.time_base = 1000000;
    offset += 4;

    if (offset + 2 > length) return false;
    offset += 2;

    for (uint8_t i = 0; i < config.phasor_count; ++i) {
        if (offset + 4 > length) {
            config.phasor_nominals.push_back(config.phasor_is_voltage[i] ? 220.0 : 100.0);
            continue;
        }
        uint32_t raw_nominal = decode_uint32(data + offset, order);
        float nominal = 0.0f;
        std::memcpy(&nominal, &raw_nominal, sizeof(float));
        if (std::isnan(nominal) || std::isinf(nominal) || nominal <= 0.0f) {
            nominal = config.phasor_is_voltage[i] ? 220.0f : 100.0f;
        }
        config.phasor_nominals.push_back(static_cast<double>(nominal));
        offset += 4;
    }

    return true;
}

bool C37118Decoder::decode_header_frame(const uint8_t* data, size_t length, ByteOrder /*order*/) {
    return length >= 16;
}

void C37118Decoder::register_config(const PMUConfig& config) {
    std::lock_guard<std::mutex> lock(config_mutex_);
    configs_[config.pmu_id] = config;
}

bool C37118Decoder::has_config(uint16_t pmu_id) const {
    std::lock_guard<std::mutex> lock(config_mutex_);
    return configs_.find(pmu_id) != configs_.end();
}

const PMUConfig* C37118Decoder::get_config(uint16_t pmu_id) const {
    std::lock_guard<std::mutex> lock(config_mutex_);
    auto it = configs_.find(pmu_id);
    return it != configs_.end() ? &(it->second) : nullptr;
}

} // namespace pmu
