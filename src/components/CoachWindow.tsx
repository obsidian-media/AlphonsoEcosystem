import React, { Suspense, lazy } from 'react';
import { listCoachSkills } from '../services/coachSkillService';
import { useCoach } from '../contexts/CoachContext';
import { useSettings } from '../contexts/SettingsContext';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { companionStateFromVoice, coachMessageFromVoice, nextCoachCorner } from '../constants/appConstants';
import { ViewLoadingState } from './ViewLoadingState';

const CoachMissionBadge = lazy(() => import('./CoachMissionBadge').then((mod) => ({ default: mod.CoachMissionBadge })));
const CoachInterventionCard = lazy(() => import('./CoachInterventionCard').then((mod) => ({ default: mod.CoachInterventionCard })));
const CoachSkillGrid = lazy(() => import('./CoachSkillGrid').then((mod) => ({ default: mod.CoachSkillGrid })));
const MicrophoneStatus = lazy(() => import('./MicrophoneStatus').then((mod) => ({ default: mod.MicrophoneStatus })));

interface CompanionState {
  state: string;
  message: string;
}

interface Props {
  coachAgentFromQuery?: string;
  miyaCompanionState: CompanionState;
  joseCompanionState: CompanionState;
  hectorCompanionState: CompanionState;
}

export function CoachWindow({ coachAgentFromQuery, miyaCompanionState, joseCompanionState, hectorCompanionState }: Props) {
  const {
    coachMiniMode, setCoachMiniMode,
    coachSnapCorner, setCoachSnapCorner,
    coachIntervention, coachPauseUntilMs,
    handleCoachInterventionAction, showDemoIntervention
  } = useCoach();
  const { settings } = useSettings();
  const voice = useVoiceInput();

  const coachAgent = coachAgentFromQuery || settings.coachAgent || 'alphonso';
  const coachState = coachAgent === 'miya'
    ? miyaCompanionState
    : coachAgent === 'jose'
      ? joseCompanionState
      : coachAgent === 'hector'
        ? hectorCompanionState
        : {
          state: companionStateFromVoice(voice.voiceStatus),
          message: coachMessageFromVoice(voice.voiceStatus)
        };
  const coachSkills = listCoachSkills();
  const cornerClass = ({
    'bottom-right': 'items-end justify-end',
    'bottom-left': 'items-end justify-start',
    'top-right': 'items-start justify-end',
    'top-left': 'items-start justify-start'
  } as Record<string, string>)[coachSnapCorner] || 'items-end justify-end';

  return (
    <div data-alphonso-shell-ready="true" className={`h-screen w-screen bg-zinc-950 text-zinc-100 flex p-4 ${coachMiniMode ? cornerClass : 'items-center justify-center'}`}>
      <div className={`${coachMiniMode ? 'w-[22rem] rounded-2xl border border-cyan-300/20 bg-zinc-900/85 p-3' : 'w-full h-full rounded-2xl border border-white/10 bg-zinc-900/70 p-4'}`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500 font-bold">Coach Mode</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCoachMiniMode((current: boolean) => !current)}
              className="rounded-lg border border-white/10 bg-zinc-800 px-2 py-1 text-2xs font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700"
            >
              {coachMiniMode ? 'Full' : 'Mini'}
            </button>
            <button
              onClick={() => setCoachSnapCorner((current: string) => nextCoachCorner(current))}
              className="rounded-lg border border-white/10 bg-zinc-800 px-2 py-1 text-2xs font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700"
            >
              Snap: {coachSnapCorner}
            </button>
          </div>
        </div>

        {coachMiniMode ? (
          <div className="space-y-3">
            <Suspense fallback={<ViewLoadingState activeTab="Coach interventions" />}>
              <CoachInterventionCard intervention={coachIntervention} onAction={handleCoachInterventionAction} onDemo={showDemoIntervention} pauseUntilMs={coachPauseUntilMs} />
            </Suspense>
            <Suspense fallback={<ViewLoadingState activeTab="Mission badge" />}>
              <CoachMissionBadge agent={coachAgent} state={coachState.state} message={coachState.message} />
            </Suspense>
            <Suspense fallback={<ViewLoadingState activeTab="Skills" />}>
              <CoachSkillGrid skills={coachSkills.slice(0, 4)} compact />
            </Suspense>
            <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-2">
              <Suspense fallback={null}>
                <MicrophoneStatus voiceStatus={voice.voiceStatus} />
              </Suspense>
            </div>
          </div>
        ) : (
          <div className="grid h-[calc(100%-2.5rem)] grid-cols-[minmax(0,1fr)_17rem] gap-4">
            <div className="space-y-4 overflow-auto pr-1">
              <Suspense fallback={<ViewLoadingState activeTab="Coach interventions" />}>
                <CoachInterventionCard intervention={coachIntervention} onAction={handleCoachInterventionAction} onDemo={showDemoIntervention} pauseUntilMs={coachPauseUntilMs} />
              </Suspense>
              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-500/5 p-4">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">Coach skills</div>
                <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                  Coach Mode is for guidance, focus, handoffs, rehearsal, and safety checks — not just agent status.
                </p>
              </div>
              <Suspense fallback={<ViewLoadingState activeTab="Skills" />}>
                <CoachSkillGrid skills={coachSkills} />
              </Suspense>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-950/45 p-3">
              <div className="mb-2 text-2xs font-bold uppercase tracking-[0.16em] text-zinc-500">Agent status</div>
              <div className="space-y-2">
                <Suspense fallback={<ViewLoadingState activeTab="Alphonso" />}>
                  <CoachMissionBadge agent="alphonso" state={companionStateFromVoice(voice.voiceStatus)} message={coachMessageFromVoice(voice.voiceStatus)} />
                </Suspense>
                <Suspense fallback={<ViewLoadingState activeTab="Hector" />}>
                  <CoachMissionBadge agent="hector" state={hectorCompanionState.state} message={hectorCompanionState.message} />
                </Suspense>
                <Suspense fallback={<ViewLoadingState activeTab="Jose" />}>
                  <CoachMissionBadge agent="jose" state={joseCompanionState.state} message={joseCompanionState.message} />
                </Suspense>
                <Suspense fallback={<ViewLoadingState activeTab="Miya" />}>
                  <CoachMissionBadge agent="miya" state={miyaCompanionState.state} message={miyaCompanionState.message} />
                </Suspense>
              </div>
            </div>
          </div>
        )}
        {coachMiniMode && (
          <div className="mt-2 text-2xs text-zinc-500">
            Mini mode is always-on-top friendly and corner-snapped for fast glance monitoring.
          </div>
        )}
        <div className="mt-2 text-2xs text-zinc-600">
          Desktop coach card is local-only and supervised.
        </div>
      </div>
    </div>
  );
}
