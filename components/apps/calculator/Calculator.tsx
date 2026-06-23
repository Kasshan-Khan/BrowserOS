'use client';

import { useState } from 'react';
import type { AppWindowProps } from '@/registry/app-registry';

type Op = '+' | '-' | '×' | '÷' | null;

export default function Calculator(_props: AppWindowProps) {
  const [display, setDisplay] = useState('0');
  const [firstOperand, setFirstOperand] = useState<number | null>(null);
  const [operator, setOperator] = useState<Op>(null);
  const [waitingForSecond, setWaitingForSecond] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  function inputDigit(digit: string) {
    if (waitingForSecond) {
      setDisplay(digit);
      setWaitingForSecond(false);
    } else {
      setDisplay(display === '0' ? digit : display + digit);
    }
  }

  function inputDecimal() {
    if (waitingForSecond) {
      setDisplay('0.');
      setWaitingForSecond(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  }

  function handleOperator(op: Op) {
    const current = parseFloat(display);

    if (firstOperand !== null && !waitingForSecond) {
      const result = calculate(firstOperand, current, operator);
      setDisplay(String(result));
      setFirstOperand(result);
    } else {
      setFirstOperand(current);
    }

    setOperator(op);
    setWaitingForSecond(true);
  }

  function calculate(a: number, b: number, op: Op): number {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b !== 0 ? a / b : 0;
      default: return b;
    }
  }

  function handleEquals() {
    if (firstOperand === null || operator === null) return;
    const second = parseFloat(display);
    const result = calculate(firstOperand, second, operator);
    const entry = `${firstOperand} ${operator} ${second} = ${result}`;
    setHistory((prev) => [entry, ...prev.slice(0, 9)]);
    setDisplay(String(parseFloat(result.toFixed(10))));
    setFirstOperand(null);
    setOperator(null);
    setWaitingForSecond(false);
  }

  function handleClear() {
    setDisplay('0');
    setFirstOperand(null);
    setOperator(null);
    setWaitingForSecond(false);
  }

  function handleToggleSign() {
    setDisplay(String(parseFloat(display) * -1));
  }

  function handlePercent() {
    setDisplay(String(parseFloat(display) / 100));
  }

  const buttons = [
    { label: 'C', action: handleClear, style: 'func' },
    { label: '+/-', action: handleToggleSign, style: 'func' },
    { label: '%', action: handlePercent, style: 'func' },
    { label: '÷', action: () => handleOperator('÷'), style: 'op' },

    { label: '7', action: () => inputDigit('7'), style: 'num' },
    { label: '8', action: () => inputDigit('8'), style: 'num' },
    { label: '9', action: () => inputDigit('9'), style: 'num' },
    { label: '×', action: () => handleOperator('×'), style: 'op' },

    { label: '4', action: () => inputDigit('4'), style: 'num' },
    { label: '5', action: () => inputDigit('5'), style: 'num' },
    { label: '6', action: () => inputDigit('6'), style: 'num' },
    { label: '-', action: () => handleOperator('-'), style: 'op' },

    { label: '1', action: () => inputDigit('1'), style: 'num' },
    { label: '2', action: () => inputDigit('2'), style: 'num' },
    { label: '3', action: () => inputDigit('3'), style: 'num' },
    { label: '+', action: () => handleOperator('+'), style: 'op' },

    { label: '0', action: () => inputDigit('0'), style: 'zero' },
    { label: '.', action: inputDecimal, style: 'num' },
    { label: '=', action: handleEquals, style: 'equals' },
  ];

  const styleMap: Record<string, React.CSSProperties> = {
    func: { background: 'rgba(255,255,255,0.15)', color: '#cdd6f4' },
    op: { background: '#89b4fa', color: '#1e1e2e' },
    num: { background: 'rgba(255,255,255,0.08)', color: '#cdd6f4' },
    zero: { background: 'rgba(255,255,255,0.08)', color: '#cdd6f4', gridColumn: 'span 2', justifyContent: 'flex-start', paddingLeft: 20 },
    equals: { background: '#89b4fa', color: '#1e1e2e' },
  };

  return (
    <div className="flex flex-col h-full" style={{ background: '#11111b', color: '#cdd6f4' }}>
      {/* Display */}
      <div className="px-4 pb-2 pt-4 text-right flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {operator && (
          <div className="text-sm mb-1" style={{ color: '#89b4fa' }}>
            {firstOperand} {operator}
          </div>
        )}
        <div className="text-4xl font-light tracking-tight truncate" title={display}>
          {display.length > 9 ? parseFloat(display).toExponential(3) : display}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex-1 p-3 grid grid-cols-4 gap-2">
        {buttons.map((btn, i) => (
          <button
            key={i}
            onClick={btn.action}
            className="rounded-xl text-lg font-medium transition-all hover:brightness-110 active:scale-95 flex items-center justify-center"
            style={styleMap[btn.style]}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}
