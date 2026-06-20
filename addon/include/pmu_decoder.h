#ifndef PMU_DECODER_H
#define PMU_DECODER_H

#include <string>
#include <vector>
#include <cstdint>
#include <memory>
#include <functional>
#include <thread>
#include <mutex>
#include <atomic>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
using SockLen = int;
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
using SOCKET = int;
using SockLen = socklen_t;
constexpr SOCKET INVALID_SOCKET = -1;
constexpr int SOCKET_ERROR = -1;
#endif

namespace pmu {

struct Phasor {
    std::string name;
    double magnitude;
    double angle;
    bool is_voltage;
};

struct PhasorData {
    std::string station_id;
    uint64_t timestamp;
    double frequency;
    double freq_deviation;
    double rocof;
    std::vector<Phasor> phasors;
    std::vector<double> analogs;
    std::vector<bool> digitals;
    uint16_t data_quality;
    uint16_t pmu_id;
};

using DataCallback = std::function<void(const PhasorData&)>;

class PMUDecoder {
public:
    PMUDecoder();
    ~PMUDecoder();

    bool start(const std::string& multicast_addr, uint16_t port, 
               const std::string& interface = "0.0.0.0");
    void stop();
    void set_callback(DataCallback callback);
    bool is_running() const;

private:
    void socket_thread();
    void decode_thread();
    bool init_socket();
    void cleanup_socket();

    std::atomic<bool> running_;
    SOCKET socket_;
    std::string multicast_addr_;
    uint16_t port_;
    std::string interface_;
    DataCallback callback_;

    std::unique_ptr<std::thread> socket_thread_;
    std::unique_ptr<std::thread> decode_thread_;
    std::mutex callback_mutex_;
};

} // namespace pmu

#endif // PMU_DECODER_H
