import React, { useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus } from "lucide-react";

interface QuantitySelectorProps {
  value: number | "";
  onChange: (value: number | "") => void;
  min?: number;
  max?: number;
  step?: number | string;
}

export function QuantitySelector({ value, onChange, min = 0, max, step = 1 }: QuantitySelectorProps) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  // step="any" é válido no <input type="number"> e serve para liberar decimais,
  // mas parseFloat("any") é NaN. Sem esta proteção, o "+" somava NaN, o React
  // renderizava o campo vazio e a quantidade sumia ao tocar nos botões.
  const stepNumerico = typeof step === 'string' ? parseFloat(step) : step;
  const stepVal = Number.isFinite(stepNumerico) && stepNumerico > 0 ? stepNumerico : 1;

  const handleDecrease = () => {
    const currentValue = typeof valueRef.current === 'number' ? valueRef.current : 0;
    if (currentValue > min) {
      const nextVal = Math.round((currentValue - stepVal) * 1000) / 1000;
      onChange(nextVal >= min ? nextVal : min);
    }
  };

  const handleIncrease = () => {
    const currentValue = typeof valueRef.current === 'number' ? valueRef.current : 0;
    if (max === undefined || currentValue < max) {
      const nextVal = Math.round((currentValue + stepVal) * 1000) / 1000;
      onChange(max !== undefined && nextVal > max ? max : nextVal);
    }
  };

  const startDecrease = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return; // only left click
    handleDecrease();
    timerRef.current = setTimeout(() => {
      intervalRef.current = setInterval(handleDecrease, 100);
    }, 400);
  };

  const startIncrease = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    handleIncrease();
    timerRef.current = setTimeout(() => {
      intervalRef.current = setInterval(handleIncrease, 100);
    }, 400);
  };

  const stopTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timerRef.current = null;
    intervalRef.current = null;
  };

  useEffect(() => {
    return stopTimer;
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "") {
      onChange("");
      return;
    }
    const num = parseFloat(val);
    if (!isNaN(num)) {
      onChange(num);
    }
  };

  return (
    <div className="inline-flex items-center h-14 border border-slate-300 rounded-xl overflow-hidden bg-white w-full sm:w-[160px] shrink-0 max-w-[200px] align-middle shadow-md">
      <Button 
        type="button" 
        variant="ghost"
        className="h-full w-14 rounded-none border-0 text-slate-600 hover:bg-slate-100 shrink-0 px-0 flex items-center justify-center touch-manipulation select-none"
        onPointerDown={startDecrease}
        onPointerUp={stopTimer}
        onPointerLeave={stopTimer}
        onContextMenu={(e) => e.preventDefault()}
        disabled={typeof value === 'number' && value <= min}
      >
        <Minus className="h-6 w-6" />
      </Button>
      
      <div className="h-full w-px bg-slate-200 shrink-0" />
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        className="h-full flex-1 text-center text-xl font-bold border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none bg-transparent px-1 shadow-none outline-none"
        style={{ MozAppearance: 'textfield' }}
      />
      <div className="h-full w-px bg-slate-200 shrink-0" />
      <Button 
        type="button" 
        variant="ghost"
        className="h-full w-14 rounded-none border-0 text-slate-600 hover:bg-slate-100 shrink-0 px-0 flex items-center justify-center touch-manipulation select-none"
        onPointerDown={startIncrease}
        onPointerUp={stopTimer}
        onPointerLeave={stopTimer}
        onContextMenu={(e) => e.preventDefault()}
        disabled={max !== undefined && typeof value === 'number' && value >= max}
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
}
