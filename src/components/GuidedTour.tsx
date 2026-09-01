import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface TourStep {
  target: string;
  title: string;
  body: string;
  position: 'below' | 'right' | 'above' | 'left';
}

const TOUR_STEPS_SIMPLE: TourStep[] = [
  { target: '[data-tour="dashboard-hero"]', title: 'Welcome to Alphonso', body: 'This is your mission control. Your agents, approvals, and next actions live here.', position: 'below' },
  { target: '[data-tour="next-action-0"]', title: 'Your next move', body: 'Alphonso suggests what to do next — approvals, tasks, or starting a conversation. Click any card to jump in.', position: 'right' },
  { target: '[data-tour="sidebar-chat"]', title: 'Chat with Alphonso', body: 'Your primary interface. Ask anything, run commands, or delegate to agents. Press Cmd/Ctrl+K to open chat from anywhere.', position: 'right' },
  { target: '[data-tour="sidebar-projects"]', title: 'Structured work', body: 'Projects break work into packets with proof-first planning. Great for complex tasks.', position: 'right' },
  { target: '[data-tour="sidebar-research"]', title: 'Research desk', body: 'Hector gathers and synthesizes information. Ask it to research any topic.', position: 'right' },
  { target: '[data-tour="sidebar-creative"]', title: 'Create content', body: 'Miya handles images, video, and creative assets. Powered by local or cloud models.', position: 'right' },
  { target: '[data-tour="topbar-notifications"]', title: 'Stay informed', body: 'Notifications appear here — agent completions, approvals needed, system events.', position: 'below' },
  { target: '[data-tour="topbar-mode-toggle"]', title: 'Grow into Advanced', body: "When you're ready, switch to Advanced mode for the full agent orchestrator, runtimes, and connectors.", position: 'below' },
];

interface GuidedTourProps {
  mode: 'simple' | 'advanced';
  onComplete: () => void;
  onDismiss: () => void;
}

export function GuidedTour({ mode, onComplete, onDismiss }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(() => {
    const saved = localStorage.getItem('alphonso_tour_progress');
    return saved ? parseInt(saved, 10) : 0;
  });

  const steps = mode === 'simple' ? TOUR_STEPS_SIMPLE : TOUR_STEPS_SIMPLE;

  useEffect(() => {
    localStorage.setItem('alphonso_tour_progress', String(currentStep));
  }, [currentStep]);

  const handleNext = useCallback(() => {
    if (currentStep >= steps.length - 1) {
      localStorage.setItem('alphonso_guided_tour_complete_v1', 'true');
      localStorage.removeItem('alphonso_tour_progress');
      onComplete();
    } else {
      setCurrentStep(s => s + 1);
    }
  }, [currentStep, steps.length, onComplete]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(s => s - 1);
    }
  }, [currentStep]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem('alphonso_tour_progress', String(currentStep));
    onDismiss();
  }, [currentStep, onDismiss]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handleBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDismiss, handleNext, handleBack]);

  const step = steps[currentStep];

  return (
    <div className="fixed inset-0 z-[1000]" role="dialog" aria-modal="true" aria-label="Guided tour">
      <div className="absolute inset-0 bg-black/60" onClick={handleDismiss} />
      
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md bg-[var(--surface-1)] border border-[var(--border)] rounded-xl shadow-2xl p-6"
        style={{ animation: 'fadeIn 150ms ease-out' }}
      >
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-colors"
          aria-label="Close tour"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-lg font-semibold text-[var(--text-1)] mb-2">{step.title}</h2>
        <p className="text-sm text-[var(--text-2)] mb-6">{step.body}</p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {steps.map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  idx === currentStep ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                onClick={handleBack}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-3)] transition-colors"
              >
                <ChevronLeft className="w-3 h-3 inline mr-1" />
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-dim)] transition-colors"
            >
              {currentStep >= steps.length - 1 ? 'Get started' : 'Next'}
              {currentStep < steps.length - 1 && <ChevronRight className="w-3 h-3 inline ml-1" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
