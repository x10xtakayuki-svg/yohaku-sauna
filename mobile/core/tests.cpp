#include "SaunaEngine.hpp"
#include <cassert>
#include <cmath>
#include <fstream>
#include <iostream>
#include <limits>

using namespace yohaku;
namespace {
void check(const Snapshot& s){
    assert(std::isfinite(s.gain)&&s.gain>=0&&s.gain<=1);
    assert(s.water>=0&&s.water<=160&&s.stream>=0);
    for(const auto& stone:s.stones){assert(std::isfinite(stone.surface)&&stone.surface>90&&stone.surface<400);assert(stone.water>=0&&stone.evap>=0);}
}
void run(SaunaEngine& e,double seconds){
    float l[480],r[480];const int blocks=int(std::round(seconds*100));
    for(int j=0;j<blocks;j++){e.render(l,r,480);for(int i=0;i<480;i++)assert(std::isfinite(l[i])&&std::isfinite(r[i])&&std::abs(l[i])<=1&&std::abs(r[i])<=1);}
    check(e.snapshot());
}
void little(std::ofstream& f,std::uint32_t v,int count){for(int i=0;i<count;i++){const char byte=char((v>>(i*8))&255);f.write(&byte,1);}}
void preview(const char* path){
    SaunaEngine e;e.enqueue({Action::Start,1,1});const int seconds=90,frames=seconds*48000;
    std::ofstream f(path,std::ios::binary);f.write("RIFF",4);little(f,36+frames*4,4);f.write("WAVEfmt ",8);little(f,16,4);little(f,1,2);little(f,2,2);little(f,48000,4);little(f,192000,4);little(f,4,2);little(f,16,2);f.write("data",4);little(f,frames*4,4);
    float l[480],r[480];for(int b=0;b<frames/480;b++){e.render(l,r,480);for(int i=0;i<480;i++){little(f,std::uint16_t(std::int16_t(l[i]*32767)),2);little(f,std::uint16_t(std::int16_t(r[i]*32767)),2);}}
}
}
int main(int argc,char** argv){
    SaunaEngine manual;assert(!manual.enqueue({Action::Settings,std::numeric_limits<double>::quiet_NaN()}));
    manual.enqueue({Action::Start,0,0});manual.enqueue({Action::Fill});manual.enqueue({Action::Pour,745,405});run(manual,1);assert(manual.snapshot().water>0&&manual.snapshot().water<160);
    manual.enqueue({Action::StopPour});run(manual,4);const auto held=manual.snapshot().water;run(manual,4);assert(manual.snapshot().water==held&&manual.snapshot().mode==0);
    manual.enqueue({Action::Pour,745,405});run(manual,10);assert(manual.snapshot().water==0&&manual.snapshot().mode==0&&!manual.snapshot().pouring);
    manual.enqueue({Action::Playing,0});run(manual,.1);const auto paused=manual.snapshot().elapsed;run(manual,4);assert(manual.snapshot().elapsed==paused);
    manual.enqueue({Action::Finish});run(manual,.1);assert(manual.snapshot().phase==3&&!manual.snapshot().playing);
    for(int pattern=1;pattern<=2;pattern++){
        SaunaEngine e;e.enqueue({Action::Start,1,double(pattern)});int pours=0;double spaceStart=0,lastPour=-1000,longestSpace=0;int previous=-1;
        // No UI callbacks, polls, or timers are needed for this entire session.
        for(int second=0;second<200;second++){
            run(e,1);const auto s=e.snapshot();
            if(s.stage==1){assert(s.waterLevel==0);assert(s.stream==0);assert(s.roomLevel>=.025*.975&&s.roomLevel<=.025*1.025);}
            if(s.stage==1&&previous!=1)spaceStart=s.elapsed;
            if(s.stage==2&&previous!=2){if(pours>0){longestSpace=std::max(longestSpace,s.elapsed-spaceStart);assert(s.elapsed-spaceStart>=19);if(pattern==2)assert(s.elapsed-lastPour>=59);}lastPour=s.elapsed;pours++;}
            previous=s.stage;
        }
        assert(pours>=2&&longestSpace>=20&&e.snapshot().playing);
        e.enqueue({Action::Finish});run(e,6);assert(e.snapshot().gain>.9);run(e,15);assert(e.snapshot().phase==3&&!e.snapshot().playing);
    }
    SaunaEngine timer;timer.enqueue({Action::Duration,5});timer.enqueue({Action::Start,1,0});run(timer,301);assert(timer.snapshot().phase==3&&!timer.snapshot().playing);
    SaunaEngine bounded;int accepted=0;for(int i=0;i<200;i++)accepted+=bounded.enqueue({Action::Settings,30,60,35});assert(accepted==127);run(bounded,.1);assert(bounded.enqueue({Action::Start,1,0}));
    if(argc>1)preview(argv[1]);
    std::cout<<"PASS: sample-clock-only background progression; full tails and quiet gaps; timer; pause/finish; self pour; finite PCM; bounded command queue\n";
}
