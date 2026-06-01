import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, PlayCircle, Shield, Sparkles, Zap } from 'lucide-react';
import { AgentAvatar } from './AgentAvatar';
import alphonsoMascot from '../assets/alphonso-mascot.webp';
import joseMascot from '../assets/jose-mascot.webp';
import miyaMascot from '../assets/miya-mascot-main.webp';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 }
};

const plans = [
  { name: 'Solo Pro', price: '$29', note: '/month', points: ['Local-first desktop AI', '3 core connector workflows', 'Priority email support'] },
  { name: 'Creator Ops', price: '$59', note: '/month', points: ['Unlimited workflows', 'Advanced approvals + audit trails', 'Weekly optimization review'] },
  { name: 'Team', price: '$199', note: '/month', points: ['Up to 8 seats', 'Shared playbooks + policy presets', 'Dedicated onboarding session'] }
];

const audiences = [
  { title: 'Founders & Operators', text: 'Replace tool-hopping with one local command center for execution, approvals, and follow-through.' },
  { title: 'Agencies & Consultants', text: 'Turn repetitive delivery into reusable automation packs with clear governance and proof logs.' },
  { title: 'Creators & Research Teams', text: 'Run ideation, drafting, and distribution from one surface with quality controls built in.' }
];

const featuredAgents = [
  { id: 'alphonso', name: 'Alphonso', role: 'Execution' },
  { id: 'jose', name: 'Jose', role: 'Orchestration' },
  { id: 'miya', name: 'Miya', role: 'Creative' },
  { id: 'hector', name: 'Hector', role: 'Research' },
  { id: 'maria', name: 'Maria', role: 'Governance' },
  { id: 'marcus', name: 'Marcus', role: 'Distribution' }
];

const sections = [
  { id: 'hero', label: 'Overview' },
  { id: 'product-media', label: 'Product' },
  { id: 'audience', label: 'Audience' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'waitlist', label: 'Waitlist' }
];

export default function MarketingLandingPage() {
  const [activeSection, setActiveSection] = useState('hero');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState({ type: 'idle', message: '' });

  const waitlistEndpoint = useMemo(
    () => import.meta.env.VITE_WAITLIST_ENDPOINT || '/api/waitlist',
    []
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) {
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: '-30% 0px -45% 0px', threshold: [0.2, 0.5, 0.8] }
    );

    sections.forEach((section) => {
      const node = document.getElementById(section.id);
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, []);

  async function handleWaitlistSubmit(event) {
    event.preventDefault();
    setStatus({ type: 'loading', message: 'Submitting...' });
    try {
      const response = await fetch(waitlistEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          company: company.trim(),
          source: 'alphonso-marketing-landing'
        })
      });

      if (!response.ok) {
        throw new Error(`Waitlist request failed with status ${response.status}`);
      }

      setStatus({ type: 'success', message: 'You are on the list. We will reach out shortly.' });
      setEmail('');
      setName('');
      setCompany('');
    } catch (error) {
      setStatus({
        type: 'error',
        message: 'Could not submit right now. Please try again in a moment.'
      });
    }
  }

  return (
    <div className="alphonso-site min-h-screen text-zinc-100">
      <div className="alphonso-site__bg" />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/35 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div className="text-xl font-semibold tracking-tight">ALPHONSO</div>
          <nav className="hidden items-center gap-2 md:flex">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={`rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.14em] transition ${
                  activeSection === section.id
                    ? 'bg-amber-300 text-zinc-950'
                    : 'border border-white/15 text-zinc-300 hover:bg-white/10'
                }`}
              >
                {section.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-6 pb-20 pt-10">
        <motion.section
          id="hero"
          initial="hidden"
          animate="show"
          transition={{ staggerChildren: 0.12 }}
          className="grid gap-8 md:grid-cols-[1.2fr_0.8fr]"
        >
          <motion.div variants={fadeUp} transition={{ duration: 0.55 }} className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-200/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-amber-100">
              <Sparkles className="h-3.5 w-3.5" />
              Local-first AI Operating System
            </div>
            <h1 className="max-w-2xl text-5xl font-semibold leading-tight md:text-6xl">
              Build, run, and ship work from one command surface.
            </h1>
            <p className="max-w-xl text-lg text-zinc-300">
              Alphonso unifies chat, connectors, approvals, and execution logs so serious operators can move faster without losing control.
            </p>
            <div className="flex flex-wrap gap-3">
              <button className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-3 font-semibold text-zinc-950 hover:bg-amber-200">
                Start 14-day trial
                <ArrowRight className="h-4 w-4" />
              </button>
              <button className="rounded-full border border-white/25 px-5 py-3 font-medium hover:bg-white/10">
                Book live walkthrough
              </button>
            </div>
            <div className="pt-2">
              <div className="mb-2 text-xs uppercase tracking-[0.15em] text-zinc-400">Meet your agent crew</div>
              <div className="flex flex-wrap items-center gap-3">
                {featuredAgents.map((agent) => (
                  <div key={agent.id} className="flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-2.5 py-1.5">
                    <AgentAvatar agentId={agent.id} name={agent.name} sizeClass="h-7 w-7" />
                    <div className="leading-none">
                      <div className="text-[11px] font-semibold">{agent.name}</div>
                      <div className="text-[10px] text-zinc-400">{agent.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          <motion.div variants={fadeUp} transition={{ duration: 0.6 }} className="alphonso-site__panel">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Runtime healthy
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="mb-3 text-xs uppercase tracking-[0.14em] text-zinc-400">Today&apos;s Impact</div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-white/5 p-3"><div className="text-2xl font-semibold">3.9h</div><div className="text-zinc-400">time saved</div></div>
                  <div className="rounded-lg bg-white/5 p-3"><div className="text-2xl font-semibold">26</div><div className="text-zinc-400">tasks executed</div></div>
                  <div className="rounded-lg bg-white/5 p-3"><div className="text-2xl font-semibold">11</div><div className="text-zinc-400">connectors live</div></div>
                  <div className="rounded-lg bg-white/5 p-3"><div className="text-2xl font-semibold">0</div><div className="text-zinc-400">policy breaches</div></div>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="mb-2 text-xs uppercase tracking-[0.14em] text-zinc-400">Bonded Team, Not Just Chat</div>
                <div className="flex items-center -space-x-2">
                  {featuredAgents.map((agent) => (
                    <AgentAvatar
                      key={`panel-${agent.id}`}
                      agentId={agent.id}
                      name={agent.name}
                      sizeClass="h-10 w-10"
                      className="ring-2 ring-zinc-900"
                    />
                  ))}
                </div>
                <p className="mt-3 text-xs text-zinc-300">
                  Each specialist stays in character and handoffs are tracked, so users feel supported by a consistent team.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.section>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            { icon: Shield, title: 'Governed Execution', text: 'Approval gates and policy checks before risky external actions.' },
            { icon: Zap, title: 'Fast Automation', text: 'Reusable workflows for content, outreach, research, and operations.' },
            { icon: Sparkles, title: 'Human-Ready UX', text: 'Simple guided actions for normal users, deep controls for power users.' }
          ].map((item, idx) => (
            <motion.article
              key={item.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.45, delay: idx * 0.08 }}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur"
            >
              <item.icon className="mb-3 h-5 w-5 text-amber-200" />
              <h3 className="mb-1 text-lg font-semibold">{item.title}</h3>
              <p className="text-sm text-zinc-300">{item.text}</p>
            </motion.article>
          ))}
        </section>

        <section id="product-media">
          <h2 className="mb-4 text-3xl font-semibold">See Alphonso In Action</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { title: 'Mission Control Chat', img: alphonsoMascot, note: 'Unified execution + approvals in one view.' },
              { title: 'Operator Routing', img: joseMascot, note: 'Delegation and orchestration with policy gates.' },
              { title: 'Creative Studio', img: miyaMascot, note: 'Research-to-content workflows with continuity.' }
            ].map((shot, index) => (
              <motion.figure
                key={shot.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.4, delay: index * 0.07 }}
                className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/60"
              >
                <img src={shot.img} alt={shot.title} className="h-48 w-full object-cover" />
                <figcaption className="p-4">
                  <div className="font-semibold">{shot.title}</div>
                  <div className="mt-1 text-sm text-zinc-300">{shot.note}</div>
                </figcaption>
              </motion.figure>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
            <div className="mb-3 text-xs uppercase tracking-[0.14em] text-zinc-400">Demo Walkthrough</div>
            <a
              href={import.meta.env.VITE_MARKETING_DEMO_URL || '#'}
              className="group flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
            >
              <div>
                <div className="text-lg font-semibold">Watch 2-minute Product Tour</div>
                <div className="text-sm text-zinc-300">
                  {import.meta.env.VITE_MARKETING_DEMO_URL
                    ? 'Opens your hosted demo video.'
                    : 'Set VITE_MARKETING_DEMO_URL to your Loom/YouTube/private demo URL.'}
                </div>
              </div>
              <PlayCircle className="h-8 w-8 text-amber-300 transition group-hover:scale-110" />
            </a>
          </div>
        </section>

        <section id="audience">
          <h2 className="mb-4 text-3xl font-semibold">Who It&apos;s For</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {audiences.map((a, idx) => (
              <motion.div
                key={a.title}
                initial={{ opacity: 0, scale: 0.98 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.4, delay: idx * 0.06 }}
                className="rounded-2xl border border-white/10 bg-zinc-900/70 p-5"
              >
                <h3 className="text-lg font-semibold">{a.title}</h3>
                <p className="mt-2 text-sm text-zinc-300">{a.text}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="pricing">
          <h2 className="mb-4 text-3xl font-semibold">Pricing That Scales With Outcomes</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan, idx) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.45, delay: idx * 0.08 }}
                className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-5"
              >
                <div className="text-sm uppercase tracking-[0.14em] text-zinc-300">{plan.name}</div>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-4xl font-semibold">{plan.price}</span>
                  <span className="pb-1 text-zinc-400">{plan.note}</span>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-zinc-300">
                  {plan.points.map((p) => <li key={p}>• {p}</li>)}
                </ul>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="waitlist" className="rounded-2xl border border-white/10 bg-zinc-950/75 p-6">
          <h2 className="text-3xl font-semibold">Join The Waitlist</h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-300">
            Early users get guided onboarding, template packs, and priority roadmap influence.
          </p>

          <form onSubmit={handleWaitlistSubmit} className="mt-5 grid gap-3 md:grid-cols-3">
            <input
              required
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
              className="rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none placeholder:text-zinc-500 focus:border-amber-300/70"
            />
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Work email"
              className="rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none placeholder:text-zinc-500 focus:border-amber-300/70"
            />
            <input
              type="text"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              placeholder="Company (optional)"
              className="rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none placeholder:text-zinc-500 focus:border-amber-300/70"
            />
            <div className="md:col-span-3 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={status.type === 'loading'}
                className="rounded-full bg-amber-300 px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {status.type === 'loading' ? 'Submitting...' : 'Reserve My Spot'}
              </button>
              {status.type !== 'idle' && (
                <span className={`text-sm ${status.type === 'success' ? 'text-emerald-300' : status.type === 'error' ? 'text-red-300' : 'text-zinc-300'}`}>
                  {status.message}
                </span>
              )}
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
