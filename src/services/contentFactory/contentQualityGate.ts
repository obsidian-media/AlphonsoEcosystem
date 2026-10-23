// The quality gate and learning from the user's feedback.
// Maria scores each piece against the brand's references; pieces below the
// brand's threshold are hidden unless the user asks to see everything. A
// rejection becomes a brand lesson (fed into later prompts) and an Echo memory.
import { pushMemory } from '../unifiedMemoryService';
import { addBrandLesson, getBrand } from './contentBrandService';
import { chosenVersionOf, getProject, sendBackStep } from './contentProjectService';
import { runContentStep } from './contentStepRunner';
import type { ContentBrand, ContentProject, StepId } from './contentTypes';

export interface PieceRow {
  pieceId: string;
  score: number;
  comparedTo: string;
  weakPoints: string[];
  visible: boolean;
}

export function visiblePieces(project: ContentProject, brand: Pick<ContentBrand, 'qualityThreshold'>): PieceRow[] {
  const chosen = chosenVersionOf(project, 'quality');
  const pieces = (chosen?.output as { maria?: { pieces?: Omit<PieceRow, 'visible'>[] } })?.maria?.pieces || [];
  return pieces.map((piece) => ({
    pieceId: piece.pieceId,
    score: piece.score,
    comparedTo: piece.comparedTo || '',
    weakPoints: piece.weakPoints || [],
    visible: piece.score >= brand.qualityThreshold || project.brief.showEverything,
  }));
}

export function rejectPiece(projectId: string, step: StepId, pieceId: string, reason: string): ContentProject {
  const project = getProject(projectId);
  if (!project) throw new Error(`Content project not found: ${projectId}`);
  const lesson = `${step}: ${reason.trim()}`;
  const brand = getBrand(project.brandId);
  if (brand) addBrandLesson(brand.id, lesson, 'rejection');
  // pushMemory is plain JS; its inferred type lists only `namespace`.
  (pushMemory as unknown as (item: Record<string, unknown>) => unknown)({
    namespace: 'shared',
    title: `Content feedback for ${brand?.name || 'a brand'}`,
    category: 'preference_memory',
    sourceAgent: 'echo',
    source: 'content-factory',
    projectId,
    content: `${lesson} (piece ${pieceId}, project "${project.name}")`,
    tags: ['content-factory', 'lesson', step],
  });
  return sendBackStep(projectId, step, reason.trim());
}

export function retryWithReason(projectId: string, step: StepId, reason: string, settings: { outputFolder?: string | null }) {
  return runContentStep(projectId, step, { settings, extraTask: `The user sent the last version back: ${reason.trim()}` });
}
