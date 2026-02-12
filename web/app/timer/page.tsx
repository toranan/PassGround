"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Pause, RotateCcw } from "lucide-react";
import { Navbar } from "@/components/Navbar";

export default function TimerPage() {
    return (
        <div className="min-h-screen bg-background flex flex-col">
            <Navbar />
            <main className="flex-1 container mx-auto px-4 py-12 flex flex-col items-center justify-center space-y-8">
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight">수험생 전용 타이머</h1>
                    <p className="text-muted-foreground">
                        실전처럼 시간을 관리하고, 순공 시간을 기록하세요.
                    </p>
                </div>

                <Tabs defaultValue="stopwatch" className="w-full max-w-md">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="stopwatch">스톱워치 (순공)</TabsTrigger>
                        <TabsTrigger value="timer">타이머 (문제풀이)</TabsTrigger>
                    </TabsList>

                    <TabsContent value="stopwatch">
                        <Stopwatch />
                    </TabsContent>

                    <TabsContent value="timer">
                        <CountdownTimer />
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}

function Stopwatch() {
    const [time, setTime] = useState(0);
    const [isRunning, setIsRunning] = useState(false);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (isRunning) {
            intervalRef.current = setInterval(() => {
                setTime((prev) => prev + 10);
            }, 10);
        } else if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isRunning]);

    const formatTime = (ms: number) => {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const centiseconds = Math.floor((ms % 1000) / 10);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${centiseconds.toString().padStart(2, '0')}`;
    };

    return (
        <Card className="mt-6 border-2 shadow-sm">
            <CardHeader>
                <CardTitle className="text-center text-lg text-muted-foreground">누적 학습 시간</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-8">
                <div className="text-6xl font-mono font-bold tracking-wider tabular-nums">
                    {formatTime(time)}
                </div>
                <div className="flex gap-4">
                    <Button
                        size="lg"
                        variant={isRunning ? "secondary" : "default"}
                        className="w-32 h-14 text-lg"
                        onClick={() => setIsRunning(!isRunning)}
                    >
                        {isRunning ? <><Pause className="mr-2 h-5 w-5" /> 일시정지</> : <><Play className="mr-2 h-5 w-5" /> 시작</>}
                    </Button>
                    <Button
                        size="icon"
                        variant="outline"
                        className="h-14 w-14"
                        onClick={() => {
                            setIsRunning(false);
                            setTime(0);
                        }}
                    >
                        <RotateCcw className="h-6 w-6" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function CountdownTimer() {
    const [duration, setDuration] = useState(60 * 60 * 1000); // Default 1 hour
    const [timeLeft, setTimeLeft] = useState(duration);
    const [isRunning, setIsRunning] = useState(false);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (isRunning && timeLeft > 0) {
            intervalRef.current = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1000) {
                        setIsRunning(false);
                        return 0;
                    }
                    return prev - 1000;
                });
            }, 1000);
        } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isRunning, timeLeft]);

    const formatTime = (ms: number) => {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const setCustomTime = (minutes: number) => {
        setIsRunning(false);
        const newDuration = minutes * 60 * 1000;
        setDuration(newDuration);
        setTimeLeft(newDuration);
    };

    return (
        <Card className="mt-6 border-2 shadow-sm">
            <CardHeader>
                <CardTitle className="text-center text-lg text-muted-foreground">남은 시간</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-8">
                <div className="text-6xl font-mono font-bold tracking-wider tabular-nums">
                    {formatTime(timeLeft)}
                </div>

                <div className="grid grid-cols-3 gap-2 w-full max-w-xs">
                    <Button variant="outline" size="sm" onClick={() => setCustomTime(30)}>30분</Button>
                    <Button variant="outline" size="sm" onClick={() => setCustomTime(60)}>60분</Button>
                    <Button variant="outline" size="sm" onClick={() => setCustomTime(90)}>90분</Button>
                </div>

                <div className="flex gap-4">
                    <Button
                        size="lg"
                        variant={isRunning ? "secondary" : "default"}
                        className="w-32 h-14 text-lg"
                        onClick={() => setIsRunning(!isRunning)}
                        disabled={timeLeft === 0}
                    >
                        {isRunning ? <><Pause className="mr-2 h-5 w-5" /> 일시정지</> : <><Play className="mr-2 h-5 w-5" /> 시작</>}
                    </Button>
                    <Button
                        size="icon"
                        variant="outline"
                        className="h-14 w-14"
                        onClick={() => {
                            setIsRunning(false);
                            setTimeLeft(duration);
                        }}
                    >
                        <RotateCcw className="h-6 w-6" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
