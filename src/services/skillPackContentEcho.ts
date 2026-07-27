import { TRUST_STATES } from './trustModel';

export const ECHO_BASE_PACKS = [
  {
    id: 'pack.echo-decision-capture',
    name: 'Echo Decision Capture',
    version: '1.0.0',
    enabled: true,
    permissions: ['memory.decisions', 'knowledge.context', 'timeline.decisions'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Capture architectural decisions with rationale and context',
      'Record design choice alternatives that were considered',
      'Archive decision outcomes for future reference'
    ]
  },
  {
    id: 'pack.echo-retention-classification',
    name: 'Echo Retention Classification',
    version: '1.0.0',
    enabled: true,
    permissions: ['retention.classify', 'retention.policies', 'memory.categories'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Classify memory entries by retention priority and expiration',
      'Apply retention policies to old conversation contexts',
      'Categorize memories by project, agent, and importance'
    ]
  },
  {
    id: 'pack.echo-confidence-normalization',
    name: 'Echo Confidence Normalization',
    version: '1.0.0',
    enabled: true,
    permissions: ['memory.confidence', 'knowledge.quality', 'retention.score'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Normalize confidence scores across different memory sources',
      'Adjust memory reliability ratings based on corroboration',
      'Flag low-confidence memories for review or deletion'
    ]
  },
  {
    id: 'pack.echo-knowledge-indexing',
    name: 'Echo Knowledge Indexing',
    version: '1.0.0',
    enabled: true,
    permissions: ['knowledge.index', 'memory.retrieve', 'timeline.search'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Build and maintain searchable knowledge indices',
      'Index decision records for fast retrieval',
      'Create cross-reference links between related memories'
    ]
  },
  {
    id: 'pack.echo-historical-context',
    name: 'Echo Historical Context',
    version: '1.0.0',
    enabled: true,
    permissions: ['knowledge.context', 'timeline.history', 'memory.context'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Retrieve historical context for current task decisions',
      'Reconstruct prior conversation context for continuity',
      'Surface relevant past decisions for current work'
    ]
  },
  {
    id: 'pack.echo-audit-trail',
    name: 'Echo Audit Trail',
    version: '1.0.0',
    enabled: true,
    permissions: ['timeline.audit', 'memory.trail', 'knowledge.trace'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Maintain audit trail of all agent actions and decisions',
      'Track who did what and when across sessions',
      'Generate audit reports for compliance review'
    ]
  },
  {
    id: 'pack.echo-memory-synthesis-advanced',
    name: 'Echo Memory Synthesis Advanced',
    version: '1.0.0',
    enabled: true,
    permissions: ['memory.synthesize', 'knowledge.merge', 'timeline.merge'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Synthesize memories from multiple agents into unified context',
      'Merge duplicate memory entries while preserving nuances',
      'Create summary memories from detailed conversation logs'
    ]
  },
  {
    id: 'pack.echo-context-retrieval',
    name: 'Echo Context Retrieval',
    version: '1.0.0',
    enabled: true,
    permissions: ['memory.retrieve', 'knowledge.search', 'timeline.query'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Retrieve relevant memories for current task context',
      'Search historical data for similar past situations',
      'Query memory store with semantic similarity matching'
    ]
  },
  {
    id: 'pack.echo-memory-pruning',
    name: 'Echo Memory Pruning',
    version: '1.0.0',
    enabled: true,
    permissions: ['retention.prune', 'memory.cleanup', 'retention.archive'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Prune stale memories that exceed retention policies',
      'Archive old memories to cold storage before deletion',
      'Clean up duplicate or low-value memory entries'
    ]
  },
  {
    id: 'pack.echo-session-continuity',
    name: 'Echo Session Continuity',
    version: '1.0.0',
    enabled: true,
    permissions: ['memory.session', 'knowledge.continuity', 'timeline.session'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Save session state for cross-session continuity',
      'Restore context from previous sessions',
      'Track session boundaries and key events'
    ]
  },
  {
    id: 'pack.echo-memory-validation',
    name: 'Echo Memory Validation',
    version: '1.0.0',
    enabled: true,
    permissions: ['memory.validate', 'knowledge.verify', 'retention.quality'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Validate memory entries for completeness and accuracy',
      'Verify cross-references between related memories',
      'Check memory metadata for consistency'
    ]
  },
  {
    id: 'pack.echo-timeline-construction',
    name: 'Echo Timeline Construction',
    version: '1.0.0',
    enabled: true,
    permissions: ['timeline.construct', 'memory.timeline', 'knowledge.temporal'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Construct chronological timelines of project events',
      'Map decision chains across multiple sessions',
      'Build temporal indices for time-range queries'
    ]
  },
  {
    id: 'pack.echo-knowledge-graph',
    name: 'Echo Knowledge Graph',
    version: '1.0.0',
    enabled: true,
    permissions: ['knowledge.graph', 'memory.relate', 'knowledge.edges'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Build knowledge graphs linking related memories and decisions',
      'Identify relationships between concepts across memory entries',
      'Maintain edge weights based on co-occurrence strength'
    ]
  },
  {
    id: 'pack.echo-memory-reporting',
    name: 'Echo Memory Reporting',
    version: '1.0.0',
    enabled: true,
    permissions: ['memory.report', 'retention.summary', 'knowledge.stats'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Generate memory usage and retention reports',
      'Summarize memory health across categories',
      'Report on knowledge coverage gaps'
    ]
  },
  {
    id: 'pack.echo-preference-learning',
    name: 'Echo Preference Learning',
    version: '1.0.0',
    enabled: true,
    permissions: ['memory.preferences', 'knowledge.user', 'retention.personal'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Learn and store user preferences from interactions',
      'Track preference changes over time',
      'Surface relevant preferences in context'
    ]
  },
  {
    id: 'pack.echo-decision-diff',
    name: 'Echo Decision Diff',
    version: '1.0.0',
    enabled: true,
    permissions: ['memory.diff', 'knowledge.compare', 'timeline.changes'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Diff current decisions against previous versions',
      'Identify what changed between decision revisions',
      'Track decision evolution over time'
    ]
  },
  {
    id: 'pack.sentinel-vuln-scan',
    name: 'Sentinel Vulnerability Scan Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['security.scan', 'risk.classification', 'permission.review', 'audit.findings'],
    category: 'agent_skill',
    ownerAgent: 'sentinel',
    trust: TRUST_STATES.VERIFIED
  },
  // ── Sentinel new packs ──────────────────────────────────────────────
];
