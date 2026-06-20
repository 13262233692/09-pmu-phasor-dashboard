#ifndef C37118_DECODER_H
#define C37118_DECODER_H

#include "pmu_decoder.h"
#include <vector>
#include <cstdint>
#include <unordered_map>
#include <mutex>

namespace pmu {

enum FrameType : uint16_t {
    DATA_FRAME = 0x0000,
    HEADER_FRAME = 0x0001,
    CFG1_FRAME = 0x0002,
    CFG2_FRAME = 0x0003,
    CFG3_FRAME = 0x0005,
    CMD_FRAME = 0x0004
};

enum ByteOrder : uint8_t {
    BYTE_ORDER_UNKNOWN = 0,
    BYTE_ORDER_BIG_ENDIAN = 1,
    BYTE_ORDER_LITTLE_ENDIAN = 2
};

struct PMUConfig {
    uint16_t pmu_id;
    std::string station_name;
    uint8_t phasor_count;
    uint8_t analog_count;
    uint8_t digital_count;
    uint32_t time_base;
    std::vector<std::string> phasor_names;
    std::vector<bool> phasor_is_voltage;
    std::vector<double> phasor_nominals;
};

class C37118Decoder {
public:
    C37118Decoder();
    ~C37118Decoder();

    bool decode(const uint8_t* data, size_t length, PhasorData& output);
    void register_config(const PMUConfig& config);
    bool has_config(uint16_t pmu_id) const;
    const PMUConfig* get_config(uint16_t pmu_id) const;

private:
    static constexpr uint16_t SYNC_MAGIC_MASK = 0xFFF0;
    static constexpr uint16_t SYNC_MAGIC_BE = 0xAA00;
    static constexpr uint16_t SYNC_MAGIC_LE = 0x00AA;

    bool detect_byte_order(const uint8_t* data, size_t length, ByteOrder& order);
    ByteOrder get_pmu_byte_order(uint16_t pmu_id) const;
    void set_pmu_byte_order(uint16_t pmu_id, ByteOrder order);

    uint16_t decode_uint16(const uint8_t* data, ByteOrder order);
    uint32_t decode_uint32(const uint8_t* data, ByteOrder order);
    double decode_ieee_single(const uint8_t* data, ByteOrder order);

    bool decode_data_frame(const uint8_t* data, size_t length, PhasorData& output, ByteOrder order);
    bool decode_cfg_frame(const uint8_t* data, size_t length, PMUConfig& config, ByteOrder order);
    bool decode_header_frame(const uint8_t* data, size_t length, ByteOrder order);
    uint64_t decode_timestamp(uint32_t soc, uint32_t fracsec, uint32_t time_base);

    bool validate_phasor_data(const PhasorData& data, const PMUConfig& cfg);
    double clamp_value(double value, double min_val, double max_val, const char* name);

    std::unordered_map<uint16_t, PMUConfig> configs_;
    std::unordered_map<uint16_t, ByteOrder> pmu_byte_orders_;
    mutable std::mutex config_mutex_;
    mutable std::mutex byte_order_mutex_;
};

} // namespace pmu

#endif // C37118_DECODER_H
