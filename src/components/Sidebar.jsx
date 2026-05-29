import {
  Activity,
  ChevronDown,
  Clapperboard,
  Cloud,
  Crown,
  FileText,
  FolderOpen,
  Layers,
  MessageSquare,
  Plus,
  Settings,
  Sparkles,
  Terminal,
  Trash2,
  Zap
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'chat', icon: MessageSquare, label: 'Chat Hub' },
  { id: 'orchestrator', icon: Crown, label: 'Jose' },
  { id: 'hector', icon: Cloud, label: 'Hector' },
  { id: 'miya', icon: Clapperboard, label: 'Miya Studio' },
  { id: 'content', icon: FileText, label: 'Content' },
  { id: 'project_execution', icon: Terminal, label: 'Project Exec' },
  { id: 'automation', icon: Zap, label: 'Automation' },
  { id: 'files', icon: FolderOpen, label: 'Knowledge' },
  { id: 'ecosystem', icon: Layers, label: 'Ecosystem' },
  { id: 'operator', icon: Activity, label: 'Operator' }
];

export function Sidebar({ activeTab, setActiveTab, isOpen, onToggle, conversations, activeChatId, setActiveChatId, onCreateChat, onDeleteChat }) {
  return (
    <aside className={`${isOpen ? 'w-72' : 'w-20'} flex flex-col transition-all duration-300 ease-in-out bg-zinc-950 shrink-0 border-r border-white/[0.03]`}>
      <div className="h-16 flex items-center px-4 border-b border-white/[0.05] shrink-0">
        <div className="flex items-center gap-3 w-full">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.3)] shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          {isOpen && <span className="font-bold text-sm tracking-widest bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-500">ALPHONSO</span>}
          <button
            onClick={onToggle}
            className="ml-auto p-1 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0"
            title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? '-rotate-90' : 'rotate-90'}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="py-4 px-3 flex flex-col gap-1 shrink-0">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              aria-label={item.label}
              aria-current={activeTab === item.id ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 ${
                activeTab === item.id ? 'bg-zinc-800 text-white ring-1 ring-white/10' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
              }`}
            >
              <item.icon className={`w-4 h-4 ${activeTab === item.id ? 'text-indigo-400' : ''}`} />
              {isOpen && <span className="font-medium">{item.label}</span>}
            </button>
          ))}
        </div>

        {isOpen && (
          <div className="flex flex-col flex-1 px-3 mt-4 overflow-hidden">
            <div className="flex items-center justify-between px-3 mb-2">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Recent Chats</span>
              <button
                onClick={onCreateChat}
                className="p-1 hover:bg-zinc-800 rounded-md transition-colors text-zinc-400 hover:text-white"
                title="New chat"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {conversations.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => {
                    setActiveChatId(chat.id);
                    setActiveTab('chat');
                  }}
                  className={`group flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs cursor-pointer transition-all ${
                    activeChatId === chat.id && activeTab === 'chat'
                      ? 'bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-500/20'
                      : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <MessageSquare className="w-3 h-3 shrink-0" />
                    <span className="truncate">{chat.title}</span>
                  </div>
                  <button
                    onClick={(event) => onDeleteChat(chat.id, event)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 hover:text-red-400 rounded transition-all"
                    title="Delete chat"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-white/[0.05] space-y-2">
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-all ${
            activeTab === 'settings' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800/50'
          }`}
        >
          <Settings className="w-4 h-4" />
          {isOpen && <span>Settings</span>}
        </button>
      </div>
    </aside>
  );
}
