#include "c37118_decoder.h"
#include <cstring>
#include <cmath>
#include <chrono>

namespace pmu {

C37118Decoder::C37118Decoder() = default;
C37118Decoder::~C37118Decoder() = default;

uint16_t C37118Decoder::decode_uint16(const uint8_t* data) {
    return (static_cast<uint16_t>(data[0]) << 8) | 
           static_cast<uint16_t>(data[1]);
}

uint32_t C37118Decoder::decode_uint32(const uint8_t* data) {
    return (static_cast<uint32_t>(data[0]) << 24) |
           (static_cast<uint32_t>(data[1]) << 16) |
           (static_cast<uint32_t>(data[2]) << 8) |
           static_cast<uint32_t>(data[3]);
}

double C37118Decoder::decode_ieee_single(const uint8_t* data) {
    uint32_t raw = decode_uint32(data);
    float value;
    std::memcpy(&value, &raw, sizeof(float));
    return static_cast<double>(value);
}

uint64_t C37118Decoder::decode_timestamp(uint32_t soc, uint32_t fracsec, uint32_t time_base) {
    uint64_t epoch_ms = static_cast<uint64_t>(soc) * 1000;
    double frac_ms = (static_cast<double>(fracsec & 0x00FFFFFF) / 
                      static_cast<double>(time_base)) * 1000.0;
    return epoch_ms + static_cast<uint64_t>(frac_ms);
}

bool C37118Decoder::decode(const uint8_t* data, size_t length, PhasorData& output) {
    if (length < 4) return false;

    uint16_t sync = decode_uint16(data);
    uint16_t frame_size = decode_uint16(data + 2);
    uint16_t id_code = decode_uint16(data + 4);
    uint16_t frame_type = (sync >> 4) & 0x000F;

    if (frame_size > length) return false;

    output.pmu_id = id_code;

    switch (frame_type) {
        case DATA_FRAME:
            return decode_data_frame(data, length, output);
        case CFG1_FRAME:
        case CFG2_FRAME:
        case CFG3_FRAME: {
            PMUConfig config;
            if (decode_cfg_frame(data, length, config)) {
                register_config(config);
            }
            return false;
        }
        case HEADER_FRAME:
            return decode_header_frame(data, length);
        default:
            return false;
    }
}

bool C37118Decoder::decode_data_frame(const uint8_t* data, size_t length, PhasorData& output) {
    std::lock_guard<std::mutex> lock(config_mutex_);

    size_t offset = 6;
    uint32_t soc = decode_uint32(data + offset);
    offset += 4;
    uint32_t fracsec = decode_uint32(data + offset);
    offset += 4;

    auto cfg_it = configs_.find(output.pmu_id);
    if (cfg_it == configs_.end()) {
        return false;
    }

    const PMUConfig& cfg = cfg_it->second;
    uint32_t time_base = cfg.time_base;

    output.timestamp = decode_timestamp(soc, fracsec, time_base);
    output.station_id = cfg.station_name;

    for (uint8_t i = 0; i < cfg.phasor_count; ++i) {
        if (offset + 8 > length) return false;
        Phasor phasor;
        phasor.name = i < cfg.phasor_names.size() ? cfg.phasor_names[i] : "PH" + std::to_string(i);
        phasor.is_voltage = i < cfg.phasor_is_voltage.size() ? cfg.phasor_is_voltage[i] : true;
        double real = decode_ieee_single(data + offset);
        offset += 4;
        double imag = decode_ieee_single(data + offset);
        offset += 4;
        phasor.magnitude = std::sqrt(real * real + imag * imag);
        phasor.angle = std::atan2(imag, real) * 180.0 / M_PI;
        output.phasors.push_back(phasor);
    }

    if (offset + 8 > length) return false;
    output.frequency = 50.0 + decode_ieee_single(data + offset);
    offset += 4;
    output.freq_deviation = decode_ieee_single(data + offset);
    offset += 4;
    output.rocof = decode_ieee_single(data + offset);
    offset += 4;

    for (uint8_t i = 0; i < cfg.analog_count; ++i) {
        if (offset + 4 > length) break;
        output.analogs.push_back(decode_ieee_single(data + offset));
        offset += 4;
    }

    uint8_t digital_words = (cfg.digital_count + 15) / 16;
    for (uint8_t i = 0; i < digital_words; ++i) {
        if (offset + 2 > length) break;
        uint16_t digital = decode_uint16(data + offset);
        offset += 2;
        for (int b = 0; b < 16 && output.digitals.size() < cfg.digital_count; ++b) {
            output.digitals.push_back((digital >> (15 - b)) & 0x01);
        }
    }

    if (offset + 2 <= length) {
        output.data_quality = decode_uint16(data + offset);
        offset += 2;
    }

    return true;
}

bool C37118Decoder::decode_cfg_frame(const uint8_t* data, size_t length, PMUConfig& config) {
    size_t offset = 6;
    offset += 8;

    config.pmu_id = decode_uint16(data + offset);
    offset += 2;

    char station_name[17];
    std::memcpy(station_name, data + offset, 16);
    station_name[16] = '\0';
    config.station_name = std::string(station_name);
    offset += 16;

    offset += 2;
    config.phasor_count = (data[offset] >> 4) & 0x0F;
    config.analog_count = data[offset] & 0x0F;
    uint8_t digital_count = data[offset + 1];
    uint8_t digital_word_count = (digital_count + 15) / 16;
    config.digital_count = digital_count;
    offset += 2;

    for (uint8_t i = 0; i < config.phasor_count; ++i) {
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
        offset += 16;
    }

    for (uint8_t i = 0; i < digital_word_count; ++i) {
        offset += 16;
    }

    offset += 4;
    config.time_base = decode_uint32(data + offset) & 0x00FFFFFF;
    offset += 4;

    offset += 2;

    for (uint8_t i = 0; i < config.phasor_count; ++i) {
        float nominal = 0.0f;
        std::memcpy(&nominal, data + offset, sizeof(float));
        config.phasor_nominals.push_back(static_cast<double>(nominal));
        offset += 4;
    }

    return true;
}

bool C37118Decoder::decode_header_frame(const uint8_t* data, size_t length) {
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
