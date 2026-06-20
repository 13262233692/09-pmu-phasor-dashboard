#include "pmu_decoder.h"
#include "c37118_decoder.h"
#include <iostream>
#include <cstring>
#include <vector>
#include <condition_variable>
#include <queue>
#include <chrono>

namespace pmu {

class UDPListener {
public:
    static const size_t MAX_BUFFER_SIZE = 65536;

    struct Packet {
        std::vector<uint8_t> data;
        uint64_t received_at;
    };

    static bool init_socket(SOCKET& sock, const std::string& multicast_addr, 
                            uint16_t port, const std::string& interface) {
#ifdef _WIN32
        WSADATA wsa_data;
        if (WSAStartup(MAKEWORD(2, 2), &wsa_data) != 0) {
            return false;
        }
#endif

        sock = ::socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
        if (sock == INVALID_SOCKET) {
            return false;
        }

        int reuse = 1;
        if (::setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, 
                        reinterpret_cast<const char*>(&reuse), sizeof(reuse)) == SOCKET_ERROR) {
            return false;
        }

        int recv_buffer = 10 * 1024 * 1024;
        ::setsockopt(sock, SOL_SOCKET, SO_RCVBUF, 
                    reinterpret_cast<const char*>(&recv_buffer), sizeof(recv_buffer));

        sockaddr_in local_addr;
        std::memset(&local_addr, 0, sizeof(local_addr));
        local_addr.sin_family = AF_INET;
        local_addr.sin_port = htons(port);
        local_addr.sin_addr.s_addr = INADDR_ANY;

        if (::bind(sock, reinterpret_cast<sockaddr*>(&local_addr), sizeof(local_addr)) == SOCKET_ERROR) {
            return false;
        }

        ip_mreq mreq;
        mreq.imr_multiaddr.s_addr = inet_addr(multicast_addr.c_str());
        mreq.imr_interface.s_addr = inet_addr(interface.c_str());

        if (::setsockopt(sock, IPPROTO_IP, IP_ADD_MEMBERSHIP, 
                        reinterpret_cast<const char*>(&mreq), sizeof(mreq)) == SOCKET_ERROR) {
            return false;
        }

        int loopback = 0;
        ::setsockopt(sock, IPPROTO_IP, IP_MULTICAST_LOOP, 
                    reinterpret_cast<const char*>(&loopback), sizeof(loopback));

        return true;
    }

    static void cleanup_socket(SOCKET& sock) {
        if (sock != INVALID_SOCKET) {
#ifdef _WIN32
            ::closesocket(sock);
#else
            ::close(sock);
#endif
            sock = INVALID_SOCKET;
        }
#ifdef _WIN32
        WSACleanup();
#endif
    }

    static bool receive_packet(SOCKET sock, std::vector<uint8_t>& buffer) {
        sockaddr_in sender_addr;
        SockLen sender_len = sizeof(sender_addr);

        buffer.resize(MAX_BUFFER_SIZE);
        int bytes_received = ::recvfrom(sock, 
                                       reinterpret_cast<char*>(buffer.data()),
                                       static_cast<int>(buffer.size()),
                                       0,
                                       reinterpret_cast<sockaddr*>(&sender_addr),
                                       &sender_len);

        if (bytes_received > 0) {
            buffer.resize(static_cast<size_t>(bytes_received));
            return true;
        }
        return false;
    }
};

class PMUDecoder::Impl {
public:
    std::queue<UDPListener::Packet> packet_queue;
    std::mutex queue_mutex;
    std::condition_variable queue_cv;
    C37118Decoder decoder;
    static const size_t MAX_QUEUE_SIZE = 1000;
};

PMUDecoder::PMUDecoder() 
    : running_(false), 
      socket_(INVALID_SOCKET),
      port_(0),
      impl_(std::make_unique<Impl>()) {
}

PMUDecoder::~PMUDecoder() {
    stop();
}

bool PMUDecoder::start(const std::string& multicast_addr, uint16_t port, 
                       const std::string& interface) {
    if (running_.exchange(true)) {
        return false;
    }

    multicast_addr_ = multicast_addr;
    port_ = port;
    interface_ = interface;

    if (!UDPListener::init_socket(socket_, multicast_addr_, port_, interface_)) {
        running_ = false;
        return false;
    }

    PMUConfig default_config;
    default_config.pmu_id = 1;
    default_config.station_name = "STATION_A";
    default_config.phasor_count = 6;
    default_config.analog_count = 0;
    default_config.digital_count = 0;
    default_config.time_base = 1000000;
    default_config.phasor_names = {"VA", "VB", "VC", "IA", "IB", "IC"};
    default_config.phasor_is_voltage = {true, true, true, false, false, false};
    default_config.phasor_nominals = {220.0, 220.0, 220.0, 100.0, 100.0, 100.0};
    impl_->decoder.register_config(default_config);

    PMUConfig default_config2;
    default_config2.pmu_id = 2;
    default_config2.station_name = "STATION_B";
    default_config2.phasor_count = 6;
    default_config2.analog_count = 0;
    default_config2.digital_count = 0;
    default_config2.time_base = 1000000;
    default_config2.phasor_names = {"VA", "VB", "VC", "IA", "IB", "IC"};
    default_config2.phasor_is_voltage = {true, true, true, false, false, false};
    default_config2.phasor_nominals = {220.0, 220.0, 220.0, 100.0, 100.0, 100.0};
    impl_->decoder.register_config(default_config2);

    PMUConfig default_config3;
    default_config3.pmu_id = 3;
    default_config3.station_name = "STATION_C";
    default_config3.phasor_count = 6;
    default_config3.analog_count = 0;
    default_config3.digital_count = 0;
    default_config3.time_base = 1000000;
    default_config3.phasor_names = {"VA", "VB", "VC", "IA", "IB", "IC"};
    default_config3.phasor_is_voltage = {true, true, true, false, false, false};
    default_config3.phasor_nominals = {220.0, 220.0, 220.0, 100.0, 100.0, 100.0};
    impl_->decoder.register_config(default_config3);

    PMUConfig default_config4;
    default_config4.pmu_id = 4;
    default_config4.station_name = "STATION_D";
    default_config4.phasor_count = 6;
    default_config4.analog_count = 0;
    default_config4.digital_count = 0;
    default_config4.time_base = 1000000;
    default_config4.phasor_names = {"VA", "VB", "VC", "IA", "IB", "IC"};
    default_config4.phasor_is_voltage = {true, true, true, false, false, false};
    default_config4.phasor_nominals = {220.0, 220.0, 220.0, 100.0, 100.0, 100.0};
    impl_->decoder.register_config(default_config4);

    PMUConfig default_config5;
    default_config5.pmu_id = 5;
    default_config5.station_name = "STATION_E";
    default_config5.phasor_count = 6;
    default_config5.analog_count = 0;
    default_config5.digital_count = 0;
    default_config5.time_base = 1000000;
    default_config5.phasor_names = {"VA", "VB", "VC", "IA", "IB", "IC"};
    default_config5.phasor_is_voltage = {true, true, true, false, false, false};
    default_config5.phasor_nominals = {220.0, 220.0, 220.0, 100.0, 100.0, 100.0};
    impl_->decoder.register_config(default_config5);

    socket_thread_ = std::make_unique<std::thread>(&PMUDecoder::socket_thread, this);
    decode_thread_ = std::make_unique<std::thread>(&PMUDecoder::decode_thread, this);

    return true;
}

void PMUDecoder::stop() {
    running_ = false;
    impl_->queue_cv.notify_all();

    if (socket_thread_ && socket_thread_->joinable()) {
        socket_thread_->join();
    }
    if (decode_thread_ && decode_thread_->joinable()) {
        decode_thread_->join();
    }

    UDPListener::cleanup_socket(socket_);
}

void PMUDecoder::set_callback(DataCallback callback) {
    std::lock_guard<std::mutex> lock(callback_mutex_);
    callback_ = std::move(callback);
}

bool PMUDecoder::is_running() const {
    return running_.load();
}

void PMUDecoder::socket_thread() {
    std::vector<uint8_t> buffer;

    while (running_) {
        if (UDPListener::receive_packet(socket_, buffer)) {
            UDPListener::Packet packet;
            packet.data = buffer;
            packet.received_at = std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::system_clock::now().time_since_epoch()).count();

            std::lock_guard<std::mutex> lock(impl_->queue_mutex);
            if (impl_->packet_queue.size() >= Impl::MAX_QUEUE_SIZE) {
                impl_->packet_queue.pop();
            }
            impl_->packet_queue.push(std::move(packet));
            impl_->queue_cv.notify_one();
        }
    }
}

void PMUDecoder::decode_thread() {
    while (running_) {
        UDPListener::Packet packet;
        {
            std::unique_lock<std::mutex> lock(impl_->queue_mutex);
            impl_->queue_cv.wait(lock, [this] { 
                return !impl_->packet_queue.empty() || !running_; 
            });

            if (!running_) break;
            if (impl_->packet_queue.empty()) continue;

            packet = std::move(impl_->packet_queue.front());
            impl_->packet_queue.pop();
        }

        PhasorData data;
        if (impl_->decoder.decode(packet.data.data(), packet.data.size(), data)) {
            std::lock_guard<std::mutex> lock(callback_mutex_);
            if (callback_) {
                callback_(data);
            }
        }
    }
}

} // namespace pmu
