import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bot,
  Clapperboard,
  FileVideo,
  Lightbulb,
  Megaphone,
  Palette,
  Sparkles
} from 'lucide-react';
import miyaMascot from '../assets/miya-mascot-main.webp';
import { createAgentPacket, AGENTS } from '../services/agentBusService';
import { appendSessionEvent } from '../services/sessionIntelligenceService';
import { pushMiyaMemory, upsertBrandKit } from '../services/miyaMemoryService';
import { buildMiyaExportPacket } from '../services/miyaExportPacketService';
import { generateOllamaResponse } from '../lib/ollama';
import { generateComfyUiImage, getComfyUiVideoHistory, queueComfyUiVideo } from '../services/connectorRegistryService';
import { generateRunwayVideo, listPendingRunwayJobs, resumeRunwayTask } from '../services/runwayService';
import { sendNativeNotification } from '../services/notificationService';

interface PipelineInput {
  idea: string;
  topic: string;
  niche: string;
  goal: string;
  script: string;
}

interface BrandKit {
  fonts: string;
  logos: string;
  mascots: string;
  colors: string;
  tone: string;
  targetAudience: string;
  visualStyle: string;
  cinematicStyle: string;
  channelRules: string;
}

interface PublishDraft {
  filePath: string;
  privacyStatus: string;
}

interface CapcutDraft {
  sourceFilePath: string;
  projectName: string;
}

interface MediaRuntime {
  provider: string;
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  workflowJson: string;
  lastJobId: string;
  runwayPrompt: string;
  runwayModel: string;
  runwayRatio: string;
  runwayDuration: number;
}

interface CreativeOutput {
  hook: string;
  scenes: Array<{ index: number; purpose: string; mood: string; shot: string }>;
  narration: string;
  shot_list: string[];
  visual_descriptions: string[];
  image_prompts: string[];
  video_prompts: string[];
  thumbnail_prompts: string[];
  captions: string[];
  metadata: { topic: string; niche: string; goal: string; generatedAt: string };
  export_package: { runway: string; pika: string; luma: string; capcut: string };
  rawModelResponse?: string;
  notes?: string;
  summary?: string;
  version?: string;
  [key: string]: unknown;
}

interface MediaResult {
  ok: boolean;
  provider?: string;
  connectorId?: string;
  jobId?: string;
  promptId?: string;
  imageUrls?: string[];
  outputPaths?: string[];
  previewBase64?: string;
  message?: string;
  error?: string;
  blocked?: boolean;
  trust?: string;
  checkpoint?: string;
}

interface RunwayResult {
  provider: string;
  ok: boolean;
  taskId: string | null;
  status: string;
  model: string;
  ratio: string;
  duration: number;
  outputDir: string;
  outputUrls: string[];
  outputFiles: string[];
  setupRequired: boolean;
  trust: string;
  message: string;
  error: string | null;
  startedAtMs: number;
  finishedAtMs: number;
}

interface PendingRunwayJob {
  taskId: string;
  promptText: string;
  model: string;
  ratio: string;
  duration: number;
  outputDir: string;
  startedAtMs: number;
}

interface AgentPacket {
  id: string;
  fromAgent: string;
  toAgent: string;
  title: string;
  packetType: string;
  payload: unknown;
  source: string;
  confidence: string;
  verificationState: string;
  riskLevel: string;
  actionType: string;
  commandPreview: string;
  fileChangePreview: string;
  rollbackAvailable: boolean;
  status: string;
  requiresApproval: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  references: unknown[];
  executionResult: unknown;
}

interface MiyaExportPacket {
  exportVersion: '1.0.0';
  exportType: string;
  title: string;
  topic: string;
  summary: string;
  artifactPaths: string[];
  workflowJson: unknown;
  target: string;
  privacyStatus: string;
  metadata: { generatedAtMs: number; sourceAgent: string; [key: string]: unknown };
}

interface MiyaStudioSettings {
  selectedModel?: string;
  endpoint?: string;
}

interface MiyaStudioProps {
  settings: MiyaStudioSettings;
  ollamaStatus: { state: string; label?: string };
  onStudioStateChange?: (state: string, message: string) => void;
  onPacketCreated?: (packet: AgentPacket) => void;
}

const studioTabs: Array<{ id: string; label: string; icon: typeof FileVideo }> = [
  { id: 'script', label: 'Script Studio', icon: FileVideo },
  { id: 'scene', label: 'Scene Builder', icon: Clapperboard },
  { id: 'prompt', label: 'Prompt Builder', icon: Sparkles },
  { id: 'thumbnail', label: 'Thumbnail Studio', icon: Palette },
  { id: 'campaign', label: 'Campaign Studio', icon: Megaphone },
  { id: 'brand', label: 'Brand Kit Memory', icon: Bot }
];

const defaultPipeline: PipelineInput = {
  idea: '',
  topic: '',
  niche: '',
  goal: '',
  script: ''
};

const defaultBrandKit: BrandKit = {
  fonts: '',
  logos: '',
  mascots: '',
  colors: '',
  tone: '',
  targetAudience: '',
  visualStyle: '',
  cinematicStyle: '',
  channelRules: ''
};

const defaultPublishDraft: PublishDraft = {
  filePath: '',
  privacyStatus: 'private'
};

const defaultCapcutDraft: CapcutDraft = {
  sourceFilePath: '',
  projectName: ''
};

const defaultMediaRuntime: MediaRuntime = {
  provider: 'comfyui',
  prompt: '',
  negativePrompt: '',
  width: 512,
  height: 512,
  steps: 20,
  cfgScale: 7,
  workflowJson: '',
  lastJobId: '',
  runwayPrompt: '',
  runwayModel: 'gen4.5',
  runwayRatio: '1280:720',
  runwayDuration: 5
};

export function MiyaStudio({
  settings,
  ollamaStatus,
  onStudioStateChange,
  onPacketCreated
}: MiyaStudioProps) {
  const [activeTab, setActiveTab] = useState<string>('script');
  const [pipeline, setPipeline] = useState<PipelineInput>(defaultPipeline);
  const [brandKit, setBrandKit] = useState<BrandKit>(defaultBrandKit);
  const [creativeOutput, setCreativeOutput] = useState<CreativeOutput | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string>('');
  const [publishDraft, setPublishDraft] = useState<PublishDraft>(defaultPublishDraft);
  const [capcutDraft, setCapcutDraft] = useState<CapcutDraft>(defaultCapcutDraft);
  const [mediaRuntime, setMediaRuntime] = useState<MediaRuntime>(defaultMediaRuntime);
  const [isGeneratingMedia, setIsGeneratingMedia] = useState<boolean>(false);
  const [mediaResult, setMediaResult] = useState<MediaResult | null>(null);
  const [runwayResult, setRunwayResult] = useState<RunwayResult | null>(null);
  const [runwayElapsedMs, setRunwayElapsedMs] = useState<number>(0);
  const [pendingJobs, setPendingJobs] = useState<PendingRunwayJob[]>([]);
  const runwayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runwayStartRef = useRef<number | null>(null);

  const canGenerate = settings.selectedModel && ollamaStatus.state === 'connected';

  const companionMessage = useMemo(() => {
    if (isGenerating || isGeneratingMedia) return 'Rendering creative package...';
    if (lastError) return 'Creative runtime warning.';
    if (!canGenerate) return 'Waiting for local model.';
    return 'Miya is ready to create.';
  }, [canGenerate, isGenerating, isGeneratingMedia, lastError]);

  const companionState = useMemo(() => {
    if (isGenerating || isGeneratingMedia) return 'rendering';
    if (lastError) return 'warning';
    if (!canGenerate) return 'waiting';
    return 'idle';
  }, [canGenerate, isGenerating, isGeneratingMedia, lastError]);

  const generateScriptToVideoPackage = async (): Promise<void> => {
    setIsGenerating(true);
    setLastError('');
    onStudioStateChange?.('rendering', 'Miya is building script-to-video package.');
    appendSessionEvent({
      category: 'miya_generation',
      title: 'Miya generation started',
      details: { topic: pipeline.topic, niche: pipeline.niche },
      agent: 'miya'
    });

    const basePackage = buildBasePackage(pipeline);

    if (!canGenerate) {
      setCreativeOutput({
        ...basePackage,
        notes: 'Local model is unavailable. Package generated from deterministic local template only.'
      } as CreativeOutput);
      setIsGenerating(false);
      onStudioStateChange?.('waiting', 'Waiting for model to enrich package.');
      return;
    }

    try {
      const prompt = [
        'You are Miya, a creative director AI.',
        'Return JSON with keys: hook, scenes, narration, shot_list, visual_descriptions, image_prompts, video_prompts, thumbnail_prompts, captions, metadata, export_package.',
        `Idea: ${pipeline.idea}`,
        `Topic: ${pipeline.topic}`,
        `Niche: ${pipeline.niche}`,
        `Goal: ${pipeline.goal}`,
        `Script: ${pipeline.script}`
      ].join('\n');

      const response = await generateOllamaResponse({
        endpoint: settings.endpoint!,
        model: settings.selectedModel!,
        prompt
      });

      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(response?.response || '{}');
      } catch {
        parsed = null;
      }

      const merged: CreativeOutput = {
        ...basePackage,
        ...(parsed || {}),
        rawModelResponse: response?.response || ''
      } as CreativeOutput;

      setCreativeOutput(merged);
      pushMiyaMemory({
        category: 'creative_memory',
        title: `Script->Video Package: ${pipeline.topic || 'Untitled'}`,
        content: merged,
        source: 'miya-script-pipeline'
      });

      const packet = createAgentPacket({
        fromAgent: AGENTS.MIYA,
        toAgent: AGENTS.JOSE,
        title: `Creative handoff for Jose review: ${pipeline.topic || 'Untitled project'}`,
        packetType: 'creative_review_handoff',
        payload: merged,
        source: 'miya-studio',
        requiresApproval: true,
        riskLevel: 'low',
        actionType: 'creative_package_review',
        commandPreview: 'No command execution. Miya reports creative package to Jose for routing.',
        fileChangePreview: 'No file changes.',
        rollbackAvailable: false
      });
      onPacketCreated?.(packet);
      onStudioStateChange?.('task_complete', 'Handoff packet ready for Jose.');
      appendSessionEvent({
        category: 'handoff',
        title: 'Miya -> Jose handoff packet created',
        details: { packetId: packet.id, topic: pipeline.topic },
        agent: 'miya'
      });
    } catch (error) {
      setLastError(String(error));
      onStudioStateChange?.('warning', 'Miya failed to generate package.');
      appendSessionEvent({
        category: 'error',
        title: 'Miya generation failed',
        details: { error: String(error) },
        agent: 'miya',
        verificationState: 'failed'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const saveBrandKit = (): void => {
    const saved = upsertBrandKit(brandKit);
    pushMiyaMemory({
      category: 'brand_memory',
      title: 'Brand kit update',
      content: brandKit,
      source: 'miya-brand-kit'
    });
    appendSessionEvent({
      category: 'memory',
      title: 'Miya brand kit saved',
      details: { id: saved.id },
      agent: 'miya'
    });
    onStudioStateChange?.('task_complete', 'Brand kit memory updated.');
  };

  const createYouTubePublishHandoff = (): void => {
    if (!creativeOutput) {
      setLastError('Generate a creative package first.');
      onStudioStateChange?.('warning', 'No creative package available for publish handoff.');
      return;
    }
    if (!publishDraft.filePath.trim()) {
      setLastError('Local video file path is required for YouTube publish handoff.');
      onStudioStateChange?.('warning', 'YouTube publish handoff is missing local file path.');
      return;
    }

    const exportPacket = buildMiyaExportPacket({
      exportType: 'youtube_publish_handoff',
      title: `YouTube publish request: ${pipeline.topic || 'Untitled project'}`,
      topic: pipeline.topic || '',
      summary: creativeOutput?.summary || creativeOutput?.narration || pipeline.script || '',
      artifactPaths: [publishDraft.filePath.trim()],
      target: 'youtube',
      privacyStatus: publishDraft.privacyStatus,
      metadata: {
        scriptPackageVersion: creativeOutput?.version || '1.0.0',
        tags: Array.isArray(creativeOutput?.thumbnail_prompts) ? creativeOutput.thumbnail_prompts.slice(0, 8) : []
      }
    }) as unknown as MiyaExportPacket;

    const packet = createAgentPacket({
      fromAgent: AGENTS.MIYA,
      toAgent: AGENTS.JOSE,
      title: `YouTube publish request: ${pipeline.topic || 'Untitled project'}`,
      packetType: 'youtube_publish_handoff',
      payload: {
        connectorId: 'youtube',
        flow: 'miya_to_jose_publish_request',
        exportPacket,
        topic: pipeline.topic || '',
        scriptPackage: creativeOutput,
        uploadRequest: {
          filePath: publishDraft.filePath.trim(),
          title: pipeline.topic || 'Untitled upload',
          description: creativeOutput?.narration || pipeline.script || '',
          tags: Array.isArray(creativeOutput?.thumbnail_prompts)
            ? creativeOutput.thumbnail_prompts.slice(0, 8)
            : [],
          privacyStatus: publishDraft.privacyStatus
        }
      },
      source: 'miya-studio-publish',
      requiresApproval: true,
      riskLevel: 'high',
      actionType: 'external_publish_handoff',
      commandPreview: 'No automatic upload. Jose approval and connector auth are required before any YouTube publish action.',
      fileChangePreview: 'No file write. External publish handoff packet only.',
      rollbackAvailable: false
    });
    onPacketCreated?.(packet);
    appendSessionEvent({
      category: 'handoff',
      title: 'Miya created YouTube publish handoff packet',
      details: {
        packetId: packet.id,
        connectorId: 'youtube',
        privacyStatus: publishDraft.privacyStatus,
        exportType: exportPacket.exportType
      },
      agent: 'miya'
    });
    onStudioStateChange?.('task_complete', 'YouTube publish request sent to Jose approval queue.');
  };

  const createCapCutExportHandoff = (): void => {
    if (!creativeOutput) {
      setLastError('Generate a creative package first.');
      onStudioStateChange?.('warning', 'No creative package available for CapCut handoff.');
      return;
    }

    const sourceFilePath = capcutDraft.sourceFilePath.trim();
    const projectName = capcutDraft.projectName.trim() || pipeline.topic || 'Untitled CapCut project';
    const exportPacket = buildMiyaExportPacket({
      exportType: 'capcut_export_handoff',
      title: `CapCut export brief: ${projectName}`,
      topic: pipeline.topic || '',
      summary: [
        creativeOutput?.summary || creativeOutput?.narration || pipeline.script || '',
        'CapCut is treated as a manual export/import destination. No live automation is claimed.'
      ].filter(Boolean).join('\n\n'),
      artifactPaths: sourceFilePath ? [sourceFilePath] : [],
      target: 'capcut',
      privacyStatus: 'manual_export',
      metadata: {
        projectName,
        sourceFilePath,
        exportNotes: 'CapCut integration is export/handoff only unless the platform exposes a supported API.',
        scriptPackageVersion: creativeOutput?.version || '1.0.0'
      }
    }) as unknown as MiyaExportPacket;

    const packet = createAgentPacket({
      fromAgent: AGENTS.MIYA,
      toAgent: AGENTS.JOSE,
      title: `CapCut export brief: ${projectName}`,
      packetType: 'capcut_export_handoff',
      payload: {
        connectorId: 'capcut',
        flow: 'miya_to_jose_capcut_handoff',
        exportPacket,
        projectName,
        sourceFilePath,
        scriptPackage: creativeOutput,
        importRequest: {
          sourceFilePath,
          projectName,
          note: 'Manual CapCut export/import brief only. Use the exported media file in CapCut Desktop or Web.'
        }
      },
      source: 'miya-studio-capcut',
      requiresApproval: true,
      riskLevel: 'medium',
      actionType: 'capcut_export_handoff',
      commandPreview: 'No automatic CapCut API action. Miya prepares a manual export/import brief for Jose review.',
      fileChangePreview: 'No file write. CapCut export handoff packet only.',
      rollbackAvailable: false
    });

    onPacketCreated?.(packet);
    pushMiyaMemory({
      category: 'creative_memory',
      title: `CapCut export brief: ${projectName}`,
      content: {
        projectName,
        sourceFilePath,
        exportPacket
      },
      source: 'miya-capcut-handoff'
    });
    appendSessionEvent({
      category: 'handoff',
      title: 'Miya created CapCut export brief',
      details: {
        packetId: packet.id,
        projectName,
        sourceFilePath
      },
      agent: 'miya'
    });
    onStudioStateChange?.('task_complete', 'CapCut export brief ready for Jose review.');
  };

  const generateLocalImage = async (): Promise<void> => {
    const prompt = mediaRuntime.prompt.trim() || pipeline.idea.trim() || pipeline.topic.trim();
    if (!prompt) {
      setLastError('Miya image generation requires a prompt.');
      onStudioStateChange?.('warning', 'Image prompt is missing.');
      return;
    }

    setIsGeneratingMedia(true);
    setLastError('');
    setMediaRuntime((current) => ({ ...current, provider: 'comfyui' }));
    onStudioStateChange?.('rendering', 'Miya is generating image with local ComfyUI.');
    appendSessionEvent({
      category: 'miya_generation',
      title: 'Miya local image generation started',
      details: { provider: 'comfyui', promptPreview: prompt.slice(0, 120) },
      agent: 'miya'
    });

    try {
      const result: MediaResult = await generateComfyUiImage({
        prompt,
        negativePrompt: mediaRuntime.negativePrompt,
        width: Number(mediaRuntime.width || 512),
        height: Number(mediaRuntime.height || 512),
        steps: Number(mediaRuntime.steps || 20),
        cfgScale: Number(mediaRuntime.cfgScale || 7)
      });

      setMediaResult(result);
      if (!result?.ok) {
        setLastError(result?.error || result?.message || 'Local image generation failed.');
        onStudioStateChange?.('warning', 'Local image generation failed.');
        appendSessionEvent({
          category: 'error',
          title: 'Miya local image generation failed',
          details: { error: result?.error || result?.message || 'unknown error' },
          agent: 'miya',
          verificationState: 'failed'
        });
        return;
      }

      pushMiyaMemory({
        category: 'creative_memory',
        title: `Local image generated: ${pipeline.topic || 'Untitled concept'}`,
        content: {
          provider: result.provider,
          message: result.message,
          prompt,
          checkpoint: result.checkpoint || null,
          imageUrls: result.imageUrls || [],
          outputPaths: result.outputPaths || [],
          previewBase64: result.previewBase64 || null
        },
        source: 'miya-comfyui-image'
      });
      onStudioStateChange?.('task_complete', 'Local image generated with ComfyUI.');
      appendSessionEvent({
        category: 'miya_generation',
        title: 'Miya local image generated',
        details: { provider: result.provider, message: result.message },
        agent: 'miya',
        verificationState: 'verified'
      });
    } catch (error) {
      setLastError(String(error));
      onStudioStateChange?.('warning', 'Local image generation failed.');
    } finally {
      setIsGeneratingMedia(false);
    }
  };

  const queueLocalVideo = async (): Promise<void> => {
    const prompt = mediaRuntime.prompt.trim() || pipeline.idea.trim() || pipeline.topic.trim();
    if (!prompt) {
      setLastError('Miya video queue requires a prompt.');
      onStudioStateChange?.('warning', 'Video prompt is missing.');
      return;
    }
    if (!mediaRuntime.workflowJson.trim()) {
      setLastError('ComfyUI workflow JSON is required for local video queue.');
      onStudioStateChange?.('warning', 'ComfyUI workflow JSON is missing.');
      return;
    }

    setIsGeneratingMedia(true);
    setLastError('');
    onStudioStateChange?.('rendering', 'Miya is queueing local ComfyUI video workflow.');
    appendSessionEvent({
      category: 'miya_generation',
      title: 'Miya local video queue started',
      details: { provider: 'comfyui', promptPreview: prompt.slice(0, 120) },
      agent: 'miya'
    });

    try {
      const result: MediaResult = await queueComfyUiVideo({
        prompt,
        workflowJson: mediaRuntime.workflowJson
      });
      setMediaResult(result);
      if (result?.jobId) {
        setMediaRuntime((current) => ({ ...current, lastJobId: result.jobId! }));
      }
      if (!result?.ok) {
        setLastError(result?.error || result?.message || 'ComfyUI queue failed.');
        onStudioStateChange?.('warning', 'ComfyUI queue failed.');
        appendSessionEvent({
          category: 'error',
          title: 'Miya local video queue failed',
          details: { error: result?.error || result?.message || 'unknown error' },
          agent: 'miya',
          verificationState: 'failed'
        });
        return;
      }

      pushMiyaMemory({
        category: 'creative_memory',
        title: `ComfyUI video queued: ${pipeline.topic || 'Untitled concept'}`,
        content: {
          provider: result.provider,
          prompt,
          jobId: result.jobId || null,
          message: result.message,
          exportPacket: buildMiyaExportPacket({
            exportType: 'comfyui_video_queue',
            title: `ComfyUI video queued: ${pipeline.topic || 'Untitled concept'}`,
            topic: pipeline.topic || '',
            summary: result.message || 'ComfyUI video workflow queued.',
            artifactPaths: result.outputPaths || [],
            workflowJson: mediaRuntime.workflowJson,
            target: 'comfyui',
            privacyStatus: 'local_only',
            metadata: {
              provider: result.provider,
              jobId: result.jobId || null
            }
          })
        },
        source: 'miya-comfyui-video'
      });
      onStudioStateChange?.('task_complete', 'ComfyUI video workflow queued.');
      appendSessionEvent({
        category: 'miya_generation',
        title: 'Miya local video workflow queued',
        details: { provider: result.provider, jobId: result.jobId || null },
        agent: 'miya',
        verificationState: 'verified'
      });
    } catch (error) {
      setLastError(String(error));
      onStudioStateChange?.('warning', 'ComfyUI queue failed.');
    } finally {
      setIsGeneratingMedia(false);
    }
  };

  const loadComfyHistory = async (): Promise<void> => {
    const promptId = mediaRuntime.lastJobId.trim();
    if (!promptId) {
      setLastError('Enter or queue a ComfyUI prompt_id first.');
      return;
    }
    setIsGeneratingMedia(true);
    setLastError('');
    try {
      const result: MediaResult = await getComfyUiVideoHistory(promptId);
      setMediaResult(result);
      if (!result?.ok && result?.error) {
        setLastError(result.error);
      }
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsGeneratingMedia(false);
    }
  };

  const generateRunwayVideoDraft = async (): Promise<void> => {
    const prompt = mediaRuntime.runwayPrompt.trim() || pipeline.idea.trim() || pipeline.topic.trim();
    if (!prompt) {
      setLastError('Runway video generation requires a prompt.');
      onStudioStateChange?.('warning', 'Runway video generation needs a prompt.');
      return;
    }

    setIsGeneratingMedia(true);
    setLastError('');
    setRunwayResult(null);
    setRunwayElapsedMs(0);
    runwayStartRef.current = Date.now();
    runwayTimerRef.current = window.setInterval(() => {
      setRunwayElapsedMs(Date.now() - (runwayStartRef.current || Date.now()));
    }, 1000);
    onStudioStateChange?.('rendering', 'Miya is sending a cloud draft to Runway.');
    appendSessionEvent({
      category: 'miya_generation',
      title: 'Miya Runway generation started',
      details: {
        provider: 'runway',
        promptPreview: prompt.slice(0, 120),
        model: mediaRuntime.runwayModel,
        ratio: mediaRuntime.runwayRatio,
        duration: Number(mediaRuntime.runwayDuration || 5)
      },
      agent: 'miya'
    });

    try {
      const result: RunwayResult = await generateRunwayVideo({
        promptText: prompt,
        model: mediaRuntime.runwayModel || 'gen4.5',
        ratio: mediaRuntime.runwayRatio || '1280:720',
        duration: Number(mediaRuntime.runwayDuration || 5)
      });
      setRunwayResult(result);
      sendNativeNotification('Miya', result.ok ? `Runway render complete: ${pipeline.topic || 'Untitled'}` : `Runway render failed: ${result.message || 'unknown error'}`);
      pushMiyaMemory({
        category: 'creative_memory',
        title: `Runway Draft: ${pipeline.topic || 'Untitled'}`,
        content: result,
        source: 'miya-runway-draft'
      });
      appendSessionEvent({
        category: 'media',
        title: 'Miya Runway draft generated',
        details: {
          taskId: result?.taskId || null,
          status: result?.status || 'unknown',
          outputFiles: Array.isArray(result?.outputFiles) ? result.outputFiles.length : 0
        },
        agent: 'miya',
        verificationState: result?.ok ? 'verified' : 'failed'
      });
      onStudioStateChange?.(result?.ok ? 'task_complete' : 'warning', result?.message || 'Runway draft completed.');
    } catch (error) {
      setLastError(String(error));
      onStudioStateChange?.('warning', 'Miya failed to generate a Runway draft.');
      appendSessionEvent({
        category: 'error',
        title: 'Miya Runway generation failed',
        details: { error: String(error) },
        agent: 'miya',
        verificationState: 'failed'
      });
    } finally {
      setIsGeneratingMedia(false);
      if (runwayTimerRef.current) {
        window.clearInterval(runwayTimerRef.current);
        runwayTimerRef.current = null;
      }
    }
  };

  useEffect(() => {
    listPendingRunwayJobs().then(setPendingJobs).catch(() => {});
  }, []);

  const resumePendingJob = async (job: PendingRunwayJob): Promise<void> => {
    setPendingJobs((prev) => prev.filter((j) => j.taskId !== job.taskId));
    setIsGeneratingMedia(true);
    setLastError('');
    setRunwayResult(null);
    setRunwayElapsedMs(0);
    runwayStartRef.current = Date.now();
    runwayTimerRef.current = window.setInterval(() => {
      setRunwayElapsedMs(Date.now() - (runwayStartRef.current || Date.now()));
    }, 1000);
    onStudioStateChange?.('rendering', `Resuming Runway task ${job.taskId}.`);
    try {
      const result: RunwayResult = await resumeRunwayTask({ taskId: job.taskId, outputDir: job.outputDir });
      setRunwayResult(result);
      pushMiyaMemory({
        category: 'creative_memory',
        title: `Runway Resume: ${job.taskId}`,
        content: result,
        source: 'miya-runway-resume'
      });
      onStudioStateChange?.(result.ok ? 'task_complete' : 'warning', result.message || 'Runway resume finished.');
    } catch (error) {
      setLastError(String(error));
      onStudioStateChange?.('warning', 'Runway resume failed.');
    } finally {
      setIsGeneratingMedia(false);
      if (runwayTimerRef.current) {
        window.clearInterval(runwayTimerRef.current);
        runwayTimerRef.current = null;
      }
    }
  };

  useEffect(() => () => {
    if (runwayTimerRef.current) window.clearInterval(runwayTimerRef.current);
  }, []);

  const runwayElapsedLabel = (() => {
    const s = Math.floor(runwayElapsedMs / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  })();

  const [pipelineStep, setPipelineStep] = useState<string | null>(null);

  const loadPromptsFromScript = (): void => {
    if (!creativeOutput) return;
    const imgPrompt = Array.isArray(creativeOutput.image_prompts) ? creativeOutput.image_prompts[0] : '';
    const vidPrompt = Array.isArray(creativeOutput.video_prompts) ? creativeOutput.video_prompts[0] : '';
    setMediaRuntime((current) => ({
      ...current,
      prompt: imgPrompt || current.prompt,
      runwayPrompt: vidPrompt || current.runwayPrompt
    }));
  };

  const runFullPipeline = async (): Promise<void> => {
    if (!creativeOutput) { setLastError('Generate a script package first.'); return; }
    const imgPrompt = (Array.isArray(creativeOutput.image_prompts) && creativeOutput.image_prompts[0]) || pipeline.idea || pipeline.topic;
    const vidPrompt = (Array.isArray(creativeOutput.video_prompts) && creativeOutput.video_prompts[0]) || imgPrompt;
    if (!imgPrompt) { setLastError('No image prompt found in script package.'); return; }

    setIsGeneratingMedia(true);
    setLastError('');
    setMediaResult(null);
    setRunwayResult(null);
    setPipelineStep('image');
    onStudioStateChange?.('rendering', 'Full pipeline: generating image…');

    let imgResult: MediaResult | null = null;
    try {
      imgResult = await generateComfyUiImage({
        prompt: imgPrompt,
        negativePrompt: mediaRuntime.negativePrompt,
        width: Number(mediaRuntime.width || 512),
        height: Number(mediaRuntime.height || 512),
        steps: Number(mediaRuntime.steps || 20),
        cfgScale: Number(mediaRuntime.cfgScale || 7)
      });
      setMediaResult(imgResult);
      if (!imgResult?.ok) {
        setLastError(imgResult?.error || imgResult?.message || 'Image generation failed.');
        setPipelineStep('error');
        onStudioStateChange?.('warning', 'Pipeline stopped: image generation failed.');
        setIsGeneratingMedia(false);
        return;
      }
    } catch (err) {
      setLastError(String(err));
      setPipelineStep('error');
      setIsGeneratingMedia(false);
      return;
    }

    setPipelineStep('video');
    onStudioStateChange?.('rendering', 'Full pipeline: sending to Runway…');
    setRunwayElapsedMs(0);
    runwayStartRef.current = Date.now();
    runwayTimerRef.current = window.setInterval(() => {
      setRunwayElapsedMs(Date.now() - (runwayStartRef.current || Date.now()));
    }, 1000);

    try {
      const vidResult: RunwayResult = await generateRunwayVideo({
        promptText: vidPrompt,
        model: mediaRuntime.runwayModel || 'gen4.5',
        ratio: mediaRuntime.runwayRatio || '1280:720',
        duration: Number(mediaRuntime.runwayDuration || 5)
      });
      setRunwayResult(vidResult);
      sendNativeNotification('Miya', vidResult.ok ? `Full pipeline done: ${pipeline.topic || 'Untitled'}` : `Pipeline: Runway failed — ${vidResult.message}`);
      onStudioStateChange?.(vidResult.ok ? 'task_complete' : 'warning', 'Full pipeline finished.');
      setPipelineStep(vidResult.ok ? 'done' : 'error');
    } catch (err) {
      setLastError(String(err));
      setPipelineStep('error');
    } finally {
      setIsGeneratingMedia(false);
      if (runwayTimerRef.current) { window.clearInterval(runwayTimerRef.current); runwayTimerRef.current = null; }
    }
  };

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-6xl mx-auto px-8 py-8 space-y-6">
      <header className="pb-5 border-b border-white/[0.06]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--agent-miya)]/70">Creative Studio</div>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-white">Miya — Creator Agent</h1>
            <p className="mt-1 text-[13px] text-zinc-500">{companionMessage || 'Storytelling, prompts, thumbnails, and creative handoffs.'}</p>
          </div>
          <div className="h-14 w-14 rounded-xl overflow-hidden border border-[var(--agent-miya)]/20 bg-zinc-900 shrink-0">
            <img src={miyaMascot} alt="Miya mascot" className="h-full w-full object-cover object-center miya-breathe" />
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-1">
        {studioTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
              activeTab === tab.id
                ? 'bg-white/10 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <tab.icon className="h-3 w-3" />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.15 }}
      >

      {/* Brand Kit — full width */}
      {activeTab === 'brand' && (
        <section className="card">
          <BrandKitEditor brandKit={brandKit} setBrandKit={setBrandKit} onSave={saveBrandKit} />
        </section>
      )}

      {/* Prompt/Media tab — visual generation focused */}
      {activeTab === 'prompt' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <section className="card">
              <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-3)]">Pipeline Inputs</div>
              <PipelineInputs pipeline={pipeline} setPipeline={setPipeline} />
            </section>
            <LocalGenerationPanel
              mediaRuntime={mediaRuntime}
              setMediaRuntime={setMediaRuntime}
              mediaResult={mediaResult}
              runwayResult={runwayResult}
              isBusy={isGeneratingMedia}
              isGeneratingMedia={isGeneratingMedia}
              runwayElapsedMs={runwayElapsedMs}
              runwayElapsedLabel={runwayElapsedLabel}
              pendingJobs={pendingJobs}
              pipelineStep={pipelineStep}
              hasScriptOutput={Boolean(creativeOutput)}
              onGenerateImage={generateLocalImage}
              onQueueVideo={queueLocalVideo}
              onLoadComfyHistory={loadComfyHistory}
              onGenerateRunwayVideo={generateRunwayVideoDraft}
              onResumePendingJob={resumePendingJob}
              onLoadPromptsFromScript={loadPromptsFromScript}
              onRunFullPipeline={runFullPipeline}
            />
          </div>
          <div className="space-y-4">
            <ExportPackageReadiness output={creativeOutput} canGenerate={canGenerate} />
            <OutputPanels output={creativeOutput} />
          </div>
        </div>
      )}

      {/* All other tabs (script, scene, thumbnail, campaign) — script generation focused */}
      {activeTab !== 'brand' && activeTab !== 'prompt' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <section className="card">
              <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-3)]">Pipeline Inputs</div>
              <PipelineInputs pipeline={pipeline} setPipeline={setPipeline} />
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={generateScriptToVideoPackage}
                  disabled={isGenerating || !canGenerate}
                  className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isGenerating ? 'Generating…' : 'Generate Package'}
                </button>
                {!canGenerate && (
                  <span className="text-[11px] text-zinc-600">Connect Ollama to generate</span>
                )}
              </div>
              {lastError && (
                <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-[11px] text-red-300">{lastError}</div>
              )}
            </section>
            {creativeOutput && (
              <>
                <YouTubePublishHandoffPanel
                  output={creativeOutput}
                  publishDraft={publishDraft}
                  setPublishDraft={setPublishDraft}
                  onCreateHandoff={createYouTubePublishHandoff}
                />
                <CapCutExportHandoffPanel
                  output={creativeOutput}
                  capcutDraft={capcutDraft}
                  setCapcutDraft={setCapcutDraft}
                  onCreateHandoff={createCapCutExportHandoff}
                />
              </>
            )}
          </div>
          <div className="space-y-4">
            <ExportPackageReadiness output={creativeOutput} canGenerate={canGenerate} />
            <OutputPanels output={creativeOutput} />
          </div>
        </div>
      )}

      </motion.div>
      </AnimatePresence>

      <div className="rounded-xl border border-white/[0.06] bg-zinc-900/30 px-4 py-2.5 text-[11px] text-zinc-600 flex items-center gap-3">
        <span>State: <span className="text-zinc-400">{companionState}</span></span>
        <span>·</span>
        <span>Model: <span className="text-zinc-400">{canGenerate ? settings.selectedModel : 'not connected'}</span></span>
      </div>
    </div>
    </div>
  );
}

interface ProductionPipelineMatrixProps {
  activeTab: string;
  canGenerate: boolean | string | undefined;
}

function ProductionPipelineMatrix({ activeTab, canGenerate }: ProductionPipelineMatrixProps) {
  const panels = [
    { id: 'script', title: 'Script Studio', detail: 'Long-form scripts, shorts hooks, ad reads, narration planning.', status: canGenerate ? 'model-ready' : 'generation engine not connected yet' },
    { id: 'scene', title: 'Storyboard Builder', detail: 'Scene-by-scene structure, emotional beats, visual continuity.', status: 'template foundation active' },
    { id: 'scene', title: 'Shot Planner', detail: 'Camera ideas, lighting, mood, pacing, and shot breakdowns.', status: 'template foundation active' },
    { id: 'prompt', title: 'Prompt Builder', detail: 'Image, video, cinematic, thumbnail, and animation prompts.', status: canGenerate ? 'model-ready + local adapters' : 'local adapters available' },
    { id: 'thumbnail', title: 'Thumbnail Studio', detail: 'Concepts, headline overlays, CTA ideas, emotional hooks.', status: 'package foundation active' },
    { id: 'campaign', title: 'Campaign Hub', detail: 'Launch campaigns, captions, calendars, SEO hooks, ad copy.', status: 'package foundation active' },
    { id: 'brand', title: 'Brand Memory', detail: 'Tone, colors, audience, mascot, visual and channel rules.', status: 'local memory wired' },
    { id: 'export', title: 'Export Package', detail: 'CapCut, Runway, Pika, Luma, ComfyUI-ready package foundations.', status: 'manual export + local queue' }
  ];

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
      {panels.map((panel, index) => (
        <div
          key={`${panel.title}-${index}`}
          className={`rounded-xl border p-3 ${
            activeTab === panel.id
              ? 'border-fuchsia-300/30 bg-fuchsia-500/15'
              : 'border-white/10 bg-zinc-900/45'
          }`}
        >
          <div className="text-xs font-semibold text-fuchsia-100">{panel.title}</div>
          <div className="mt-1 min-h-10 text-[11px] leading-relaxed text-zinc-500">{panel.detail}</div>
          <div className={`mt-2 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${
            panel.status.includes('not connected')
              ? 'border-amber-300/20 bg-amber-500/10 text-amber-200'
              : panel.status.includes('wired')
                ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200'
                : 'border-indigo-300/20 bg-indigo-500/10 text-indigo-200'
          }`}>
            {panel.status}
          </div>
        </div>
      ))}
    </div>
  );
}

interface ExportPackageReadinessProps {
  output: CreativeOutput | null;
  canGenerate: boolean | string | undefined;
}

function ExportPackageReadiness({ output, canGenerate }: ExportPackageReadinessProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-zinc-900/40 px-4 py-3">
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-fuchsia-200">Production Pipeline</div>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          ComfyUI local images · Runway cloud video · CapCut & YouTube export handoffs
        </p>
      </div>
      <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
        canGenerate ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200' : 'border-amber-300/20 bg-amber-500/10 text-amber-200'
      }`}>
        {canGenerate ? 'model ready' : 'model not connected'}
      </span>
    </div>
  );
}

interface LocalGenerationPanelProps {
  mediaRuntime: MediaRuntime;
  setMediaRuntime: React.Dispatch<React.SetStateAction<MediaRuntime>>;
  mediaResult: MediaResult | null;
  runwayResult: RunwayResult | null;
  isBusy: boolean;
  isGeneratingMedia: boolean;
  runwayElapsedMs: number;
  runwayElapsedLabel: string;
  pendingJobs: PendingRunwayJob[];
  pipelineStep: string | null;
  hasScriptOutput: boolean;
  onGenerateImage: () => void;
  onQueueVideo: () => void;
  onLoadComfyHistory: () => void;
  onGenerateRunwayVideo: () => void;
  onResumePendingJob: (job: PendingRunwayJob) => void;
  onLoadPromptsFromScript: () => void;
  onRunFullPipeline: () => void;
}

function LocalGenerationPanel({
  mediaRuntime,
  setMediaRuntime,
  mediaResult,
  runwayResult,
  isBusy,
  isGeneratingMedia,
  runwayElapsedMs,
  runwayElapsedLabel,
  pendingJobs,
  pipelineStep,
  hasScriptOutput,
  onGenerateImage,
  onQueueVideo,
  onLoadComfyHistory,
  onGenerateRunwayVideo,
  onResumePendingJob,
  onLoadPromptsFromScript,
  onRunFullPipeline
}: LocalGenerationPanelProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4 space-y-3">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-fuchsia-200">Local Media Generators</div>
          <p className="mt-1 text-[11px] text-zinc-500">
            Low-cost local-first adapters: ComfyUI for SD 1.5 images and workflow queueing.
          </p>
        </div>
        <span className="rounded-full border border-zinc-300/20 bg-zinc-800/60 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-300">
          no cloud render lock-in
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <textarea
          value={mediaRuntime.prompt}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setMediaRuntime((current) => ({ ...current, prompt: event.target.value }))}
          rows={3}
          className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200"
          placeholder="Media prompt (falls back to idea/topic if empty)"
        />
        <textarea
          value={mediaRuntime.negativePrompt}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setMediaRuntime((current) => ({ ...current, negativePrompt: event.target.value }))}
          rows={3}
          className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200"
          placeholder="Negative prompt for ComfyUI SD 1.5 (optional)"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <input
          type="number"
          value={mediaRuntime.width}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setMediaRuntime((current) => ({ ...current, width: Number(event.target.value || 768) }))}
          className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200"
          placeholder="Width"
        />
        <input
          type="number"
          value={mediaRuntime.height}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setMediaRuntime((current) => ({ ...current, height: Number(event.target.value || 768) }))}
          className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200"
          placeholder="Height"
        />
        <input
          type="number"
          value={mediaRuntime.steps}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setMediaRuntime((current) => ({ ...current, steps: Number(event.target.value || 24) }))}
          className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200"
          placeholder="Steps"
        />
        <input
          type="number"
          step="0.5"
          value={mediaRuntime.cfgScale}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setMediaRuntime((current) => ({ ...current, cfgScale: Number(event.target.value || 7) }))}
          className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200"
          placeholder="CFG"
        />
        <button
          onClick={onGenerateImage}
          disabled={isBusy}
          className="rounded-lg bg-fuchsia-500/85 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-fuchsia-400 disabled:opacity-60"
        >
          {isBusy ? 'Running...' : 'Generate Image'}
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-zinc-300">ComfyUI Workflow JSON (video pipeline)</label>
        <textarea
          value={mediaRuntime.workflowJson}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setMediaRuntime((current) => ({ ...current, workflowJson: event.target.value }))}
          rows={6}
          className="w-full rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-200 font-mono"
          placeholder='Paste ComfyUI API workflow JSON here. Miya injects your prompt into CLIPTextEncode "text" fields.'
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_11rem_11rem]">
        <input
          value={mediaRuntime.lastJobId}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setMediaRuntime((current) => ({ ...current, lastJobId: event.target.value }))}
          className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200"
          placeholder="ComfyUI prompt_id for history lookup"
        />
        <button
          onClick={onQueueVideo}
          disabled={isBusy}
          className="rounded-lg bg-zinc-800 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-100 hover:bg-zinc-700 disabled:opacity-60"
        >
          Queue Video
        </button>
        <button
          onClick={onLoadComfyHistory}
          disabled={isBusy}
          className="rounded-lg bg-zinc-800 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-100 hover:bg-zinc-700 disabled:opacity-60"
        >
          Check History
        </button>
      </div>

      <div className="rounded-xl border border-fuchsia-300/15 bg-fuchsia-500/5 p-4 space-y-3">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          {/* Full pipeline */}
          <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-fuchsia-200">One-Click Pipeline</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">Script → SD Image → Runway Video</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={onLoadPromptsFromScript}
                  disabled={!hasScriptOutput || isBusy}
                  className="rounded-lg border border-white/10 bg-zinc-800 px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                >
                  Load Prompts
                </button>
                <button
                  onClick={onRunFullPipeline}
                  disabled={!hasScriptOutput || isBusy}
                  className="rounded-lg bg-fuchsia-500 px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-white hover:bg-fuchsia-400 disabled:opacity-50"
                >
                  {isBusy && pipelineStep ? `${pipelineStep === 'image' ? '1/2 Image…' : '2/2 Video…'}` : 'Run Pipeline'}
                </button>
              </div>
            </div>
            {pipelineStep && (
              <div className="flex items-center gap-2 text-[10px]">
                {(['image', 'video', 'done'] as const).map((step, i) => (
                  <div key={step} className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${pipelineStep === step ? 'bg-fuchsia-400 animate-pulse' : (pipelineStep === 'done' || (pipelineStep === 'video' && i === 0)) ? 'bg-emerald-400' : pipelineStep === 'error' && i <= ['image','video'].indexOf(pipelineStep as 'image' | 'video') ? 'bg-red-400' : 'bg-zinc-700'}`} />
                    <span className={pipelineStep === step ? 'text-fuchsia-300' : 'text-zinc-600'}>{step === 'image' ? 'Image' : step === 'video' ? 'Runway' : 'Done'}</span>
                    {i < 2 && <span className="text-zinc-700">→</span>}
                  </div>
                ))}
                {pipelineStep === 'error' && <span className="text-red-400 ml-1">failed</span>}
              </div>
            )}
          </div>

          {Array.isArray(pendingJobs) && pendingJobs.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-widest text-amber-300">Interrupted Runway Jobs</div>
              {pendingJobs.map((job) => (
                <div key={job.taskId} className="flex items-center justify-between gap-3 rounded-lg bg-black/20 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-zinc-300 font-mono truncate">{job.taskId}</div>
                    <div className="text-[10px] text-zinc-500 truncate">{job.promptText}</div>
                  </div>
                  <button
                    onClick={() => onResumePendingJob?.(job)}
                    disabled={isBusy}
                    className="shrink-0 rounded-lg bg-amber-500/80 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-amber-400 disabled:opacity-60"
                  >
                    Resume
                  </button>
                </div>
              ))}
            </div>
          )}
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-fuchsia-200">Runway Cloud Video</div>
            <p className="mt-1 text-[11px] text-zinc-500">
              Backend-backed Runway draft generation. Secret stays in the Tauri backend. Output is saved locally when available.
            </p>
          </div>
          <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-fuchsia-100">
            setup required until RUNWAYML_API_SECRET is set
          </span>
        </div>

        <textarea
          value={mediaRuntime.runwayPrompt}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setMediaRuntime((current) => ({ ...current, runwayPrompt: event.target.value }))}
          rows={3}
          className="w-full rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200"
          placeholder="Runway prompt (falls back to idea/topic if empty)"
        />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            value={mediaRuntime.runwayModel}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setMediaRuntime((current) => ({ ...current, runwayModel: event.target.value }))}
            className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200"
            placeholder="Model"
          />
          <input
            value={mediaRuntime.runwayRatio}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setMediaRuntime((current) => ({ ...current, runwayRatio: event.target.value }))}
            className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200"
            placeholder="Ratio"
          />
          <input
            type="number"
            value={mediaRuntime.runwayDuration}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setMediaRuntime((current) => ({ ...current, runwayDuration: Number(event.target.value || 5) }))}
            className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200"
            placeholder="Duration seconds"
          />
        </div>

        <button
          onClick={onGenerateRunwayVideo}
          disabled={isBusy}
          className="rounded-lg bg-fuchsia-500/85 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-fuchsia-400 disabled:opacity-60"
        >
          {isGeneratingMedia && mediaRuntime.provider === 'runway' ? `Generating... ${runwayElapsedLabel}` : 'Generate Runway Video'}
        </button>

        {isGeneratingMedia && mediaRuntime.provider === 'runway' && (
          <div className="rounded-lg border border-fuchsia-500/20 bg-fuchsia-950/30 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-fuchsia-400 animate-pulse" />
              <span className="text-[11px] font-semibold text-fuchsia-300">Runway is rendering your video</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-fuchsia-600 to-pink-500 transition-all duration-1000"
                  style={{ width: `${Math.min(95, (runwayElapsedMs / (5 * 60 * 1000)) * 100)}%` }}
                />
              </div>
              <span className="text-[11px] text-zinc-400 tabular-nums shrink-0">{runwayElapsedLabel} / ~5 min</span>
            </div>
            <div className="text-[10px] text-zinc-600">Rust engine is polling Runway's task API. This window stays responsive.</div>
          </div>
        )}

        {runwayResult && (
          <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
            <div className="text-[11px] text-zinc-300">
              Provider: <span className="font-semibold">{runwayResult.provider || 'runway'}</span> | Status:{' '}
              <span className={`font-semibold ${runwayResult.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                {runwayResult.ok ? 'ok' : runwayResult.setupRequired ? 'setup_required' : 'failed'}
              </span>
            </div>
            <div className="text-[11px] text-zinc-400">{runwayResult.message || runwayResult.error || 'No runtime message.'}</div>
            {runwayResult.taskId && (
              <div className="text-[11px] text-zinc-300">Task: <span className="font-mono">{runwayResult.taskId}</span></div>
            )}
            {Array.isArray(runwayResult.outputFiles) && runwayResult.outputFiles.length > 0 && (
              <div className="space-y-1">
                {runwayResult.outputFiles.slice(0, 6).map((path) => (
                  <div key={path} className="text-[11px] text-zinc-400 font-mono">{path}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100/90">
        ComfyUI rendering is local only. Miya can generate SD 1.5 images through ComfyUI, queue ComfyUI workflows, and also offers a backend-backed Runway draft path; it does not fake completed renders.
      </div>

      {mediaResult && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
          <div className="text-[11px] text-zinc-300">
            Provider: <span className="font-semibold">{mediaResult.provider || mediaResult.connectorId}</span> | Status:{' '}
            <span className={`font-semibold ${mediaResult.ok ? 'text-emerald-300' : 'text-red-300'}`}>
              {mediaResult.ok ? 'ok' : 'failed'}
            </span>
          </div>
          <div className="text-[11px] text-zinc-400">{mediaResult.message || mediaResult.error || 'No runtime message.'}</div>
          {mediaResult.jobId && (
            <div className="text-[11px] text-zinc-300">Job: <span className="font-mono">{mediaResult.jobId}</span></div>
          )}
          {Array.isArray(mediaResult.outputPaths) && mediaResult.outputPaths.length > 0 && (
            <div className="space-y-1">
              {mediaResult.outputPaths.slice(0, 6).map((path) => (
                <div key={path} className="text-[11px] text-zinc-400 font-mono">{path}</div>
              ))}
            </div>
          )}
          {mediaResult.previewBase64 && (
            <div className="overflow-hidden rounded-lg border border-white/10 bg-zinc-950 p-2">
              <img
                src={`data:image/png;base64,${mediaResult.previewBase64}`}
                alt="Miya generated preview"
                className="max-h-56 w-auto rounded-md object-contain"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface PipelineInputsProps {
  pipeline: PipelineInput;
  setPipeline: React.Dispatch<React.SetStateAction<PipelineInput>>;
}

function PipelineInputs({ pipeline, setPipeline }: PipelineInputsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Field label="Idea" value={pipeline.idea} onChange={(value: string) => setPipeline({ ...pipeline, idea: value })} />
      <Field label="Topic" value={pipeline.topic} onChange={(value: string) => setPipeline({ ...pipeline, topic: value })} />
      <Field label="Niche" value={pipeline.niche} onChange={(value: string) => setPipeline({ ...pipeline, niche: value })} />
      <Field label="Goal" value={pipeline.goal} onChange={(value: string) => setPipeline({ ...pipeline, goal: value })} />
      <div className="lg:col-span-2 space-y-2">
        <label className="text-xs font-semibold text-zinc-300">Script / Notes</label>
        <textarea
          value={pipeline.script}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setPipeline({ ...pipeline, script: event.target.value })}
          rows={5}
          className="w-full rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200"
        />
      </div>
    </div>
  );
}

interface BrandKitEditorProps {
  brandKit: BrandKit;
  setBrandKit: React.Dispatch<React.SetStateAction<BrandKit>>;
  onSave: () => void;
}

function BrandKitEditor({ brandKit, setBrandKit, onSave }: BrandKitEditorProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(Object.entries(brandKit) as Array<[keyof BrandKit, string]>).map(([key, value]) => (
          <Field key={key} label={toLabel(key)} value={value} onChange={(next: string) => setBrandKit({ ...brandKit, [key]: next })} />
        ))}
      </div>
      <button
        onClick={onSave}
        className="rounded-lg bg-fuchsia-500/85 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-fuchsia-400"
      >
        Save Brand Kit Memory
      </button>
    </div>
  );
}

interface OutputPanelsProps {
  output: CreativeOutput | null;
}

function OutputPanels({ output }: OutputPanelsProps) {
  if (!output) {
    return (
      <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4 text-sm text-zinc-500">
        No package generated yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {Object.entries(output).map(([key, value]) => (
        <article key={key} className="rounded-xl border border-white/10 bg-zinc-900/40 p-4 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-fuchsia-200">{toLabel(key)}</h3>
          <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-300">
            {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
          </pre>
        </article>
      ))}
    </div>
  );
}

interface YouTubePublishHandoffPanelProps {
  output: CreativeOutput | null;
  publishDraft: PublishDraft;
  setPublishDraft: React.Dispatch<React.SetStateAction<PublishDraft>>;
  onCreateHandoff: () => void;
}

function YouTubePublishHandoffPanel({ output, publishDraft, setPublishDraft, onCreateHandoff }: YouTubePublishHandoffPanelProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4 space-y-3">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-zinc-200">YouTube Publish Handoff</div>
          <p className="mt-1 text-[11px] text-zinc-500">
            Creates a high-risk external publish request packet for Jose. It does not auto-upload.
          </p>
        </div>
        <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-200">
          approval required
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_10rem]">
        <input
          value={publishDraft.filePath}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPublishDraft((current) => ({ ...current, filePath: event.target.value }))}
          className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200"
          placeholder="Local video file path (for connector upload)"
        />
        <select
          value={publishDraft.privacyStatus}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setPublishDraft((current) => ({ ...current, privacyStatus: event.target.value }))}
          className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200"
        >
          <option value="private">private</option>
          <option value="unlisted">unlisted</option>
          <option value="public">public</option>
        </select>
      </div>

      <button
        onClick={onCreateHandoff}
        disabled={!output}
        className="rounded-lg bg-zinc-800 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-100 hover:bg-zinc-700 disabled:opacity-60"
      >
        Create YouTube Publish Request
      </button>
    </div>
  );
}

interface CapCutExportHandoffPanelProps {
  output: CreativeOutput | null;
  capcutDraft: CapcutDraft;
  setCapcutDraft: React.Dispatch<React.SetStateAction<CapcutDraft>>;
  onCreateHandoff: () => void;
}

function CapCutExportHandoffPanel({ output, capcutDraft, setCapcutDraft, onCreateHandoff }: CapCutExportHandoffPanelProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4 space-y-3">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-zinc-200">CapCut Export Handoff</div>
          <p className="mt-1 text-[11px] text-zinc-500">
            Creates a CapCut-ready export brief for manual import. It does not claim live CapCut automation.
          </p>
        </div>
        <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-200">
          manual export only
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_12rem]">
        <input
          value={capcutDraft.projectName}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setCapcutDraft((current) => ({ ...current, projectName: event.target.value }))}
          className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200"
          placeholder="CapCut project name"
        />
        <input
          value={capcutDraft.sourceFilePath}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setCapcutDraft((current) => ({ ...current, sourceFilePath: event.target.value }))}
          className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200"
          placeholder="Local source video path"
        />
      </div>

      <button
        onClick={onCreateHandoff}
        disabled={!output}
        className="rounded-lg bg-zinc-800 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-100 hover:bg-zinc-700 disabled:opacity-60"
      >
        Create CapCut Export Brief
      </button>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function Field({ label, value, onChange }: FieldProps) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-zinc-300">{label}</label>
      <input
        value={value}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200"
      />
    </div>
  );
}

function toLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function buildBasePackage(pipeline: PipelineInput): CreativeOutput {
  const hook = `What if ${pipeline.topic || 'your next launch'} could convert in 30 seconds?`;
  const scenes = [
    { index: 1, purpose: 'Hook reveal', mood: 'fast-intro', shot: 'close-up subject + kinetic text' },
    { index: 2, purpose: 'Problem tension', mood: 'contrast', shot: 'cutaway pain-point montage' },
    { index: 3, purpose: 'Solution reveal', mood: 'uplift', shot: 'hero product motion shot' },
    { index: 4, purpose: 'Proof + CTA', mood: 'confidence', shot: 'social proof + clear CTA' }
  ];

  return {
    hook,
    scenes,
    narration: `Topic: ${pipeline.topic || 'Untitled'}\nNiche: ${pipeline.niche || 'General'}\nGoal: ${pipeline.goal || 'Drive action'}`,
    shot_list: scenes.map((scene) => `Scene ${scene.index}: ${scene.shot}`),
    visual_descriptions: scenes.map((scene) => `${scene.purpose} with ${scene.mood} lighting`),
    image_prompts: scenes.map((scene) => `Cinematic ${pipeline.niche || 'creative'} frame for ${scene.purpose}, premium detail, controlled dramatic lighting`),
    video_prompts: scenes.map((scene) => `8-second vertical scene: ${scene.shot}, smooth camera drift, stylized highlights`),
    thumbnail_prompts: [
      `${pipeline.topic || 'Topic'} high-contrast closeup, bold expression, dramatic fuchsia/cyan lighting`,
      `Split-screen transformation concept for ${pipeline.topic || 'campaign'} with clear focal face`
    ],
    captions: [
      `Built with Miya Creative Studio | ${pipeline.topic || 'New concept'}`,
      `Local-first creative pipeline, supervised execution.`
    ],
    metadata: {
      topic: pipeline.topic,
      niche: pipeline.niche,
      goal: pipeline.goal,
      generatedAt: new Date().toISOString()
    },
    export_package: {
      runway: 'backend cloud draft hook ready',
      pika: 'prompt set ready',
      luma: 'prompt set ready',
      capcut: 'manual export brief ready'
    }
  };
}
