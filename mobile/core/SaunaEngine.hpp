#pragma once
#include <array>
#include <atomic>
#include <cstdint>
#include <vector>

namespace yohaku {
enum class Action { Start, Playing, Mode, Pattern, Settings, Duration, Fill, Pour, StopPour, Finish, Stop };
struct Command { Action action; double a=0,b=0,c=0; };
struct StoneView { double x=0,y=0,surface=0,core=0,water=0,evap=0,wet=0,light=0; };
struct Snapshot {
    bool started=false,playing=false,pouring=false;
    int mode=0,pattern=0,phase=0,stage=0;
    double elapsed=0,gain=0,water=0,stream=0,pourX=745,pourY=405,waterLevel=0,roomLevel=.025,tailTime=0;
    std::array<StoneView,24> stones{};
};

// All model and DSP state belongs to the audio render thread. UI/remote-control
// commands use a bounded SPSC queue; snapshots contain atomic scalar copies.
// render() never locks, allocates, or calls JavaScript/a foreground timer.
class SaunaEngine {
public:
    explicit SaunaEngine(double sampleRate=48000);
    bool enqueue(Command command) noexcept;
    void render(float* left,float* right,int frames,int stride=1) noexcept;
    Snapshot snapshot() const noexcept;
private:
    struct Filter {
        double b0=1,b1=0,b2=0,a1=0,a2=0,z1=0,z2=0;
        double run(double x) noexcept;
        void set(double frequency,double q,double sampleRate,bool band=false) noexcept;
    };
    struct Stone : StoneView { double rough=1,capacity=80; };
    struct Voice { Filter filter; double level=0,target=0,renderLevel=0; };
    struct Burst { Filter filter; double age=-1,length=.1,peak=0,pan=0; bool ping=false; double phase=0; };
    struct AtomicStone { std::array<std::atomic<double>,8> values{}; };
    static constexpr unsigned queueSize=128;
    std::array<Command,queueSize> commands_{};
    std::atomic<unsigned> write_{0},read_{0};
    std::array<std::atomic<double>,18> view_{};
    std::array<AtomicStone,24> stoneView_{};
    std::array<Stone,24> stones_{};
    std::array<Voice,6> voices_{};
    std::array<Burst,12> bursts_{};
    std::array<Filter,2> output_{};
    Filter ambient_;
    std::vector<float> noise_,echoL_,echoR_;
    std::uint32_t random_=8127;
    double sampleRate_,stepRemainder_=0,time_=0,audible_=0,elapsed_=0,tail_=0,ladle_=0,stream_=0;
    double volume_=.45,distance_=.6,flow_=35,duration_=0,gain_=0,currentGain_=0,roomLevel_=.025;
    double autoTime_=0,nextDrop_=4.5,stageTime_=0,wait_=6,quietFor_=0,startedAt_=0,waterLevel_=0;
    double pourX_=745,pourY_=405;
    unsigned noiseIndex_=0,echoIndexL_=0,echoIndexR_=0,burstIndex_=0;
    int mode_=0,pattern_=0,phase_=0,stage_=0,turn_=0;
    bool started_=false,playing_=false,pouring_=false;
    double random() noexcept;
    static double drift(double t) noexcept;
    void resetStones() noexcept;
    void resetAuto() noexcept;
    void apply(Command command) noexcept;
    void step(double dt) noexcept;
    void addWater(double x,double y,double amount) noexcept;
    int nearest(double x,double y) const noexcept;
    void burst(int kind,double amount,double x) noexcept;
    void publish() noexcept;
};
}
