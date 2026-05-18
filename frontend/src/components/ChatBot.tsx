import { FormEvent, useState, useEffect, useRef } from 'react';
import { X, Send, Bot, Settings, Loader2, Trash2, Save } from 'lucide-react';
import { api } from '@/api/client';
import type { Device, InterfaceInfo, FirmwareChannelsOut } from '@/api/client';

interface Msg {
  who: 'bot' | 'me';
  text: string;
  ts: number;
}

interface OpenAIConfig {
  host: string;
  endpointPath: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
}

const DEFAULT_CONFIG: OpenAIConfig = {
  host: 'http://llm2.lab.local:9911/v1',
  endpointPath: '/chat/completions',
  apiKey: '',
  model: 'qwen3-coder-next-q8-2gpu-nooffload',
  systemPrompt: `You are a helpful assistant that answers questions about device management, backups, firmware updates, and network configurations.

You have access to a set of tools (functions) that allow you to retrieve real-time data from MikroTik devices. Always use these tools when the user asks for device lists, statuses, interfaces, firmware channels, or wants to execute CLI commands. Do not guess or fabricate data.

Available tools:
- get_devices_list: returns all devices with names, IPs, statuses.
- get_device_status(identifier): detailed info about a specific device (name, IP, RouterOS version, uptime, etc.).
- get_device_interfaces(identifier): list of interfaces with statuses, comments, MACs.
- get_firmware_channels: current RouterOS channel versions and check timestamps.
- trigger_firmware_check: manually request a firmware update check.
- execute_device_command(device_identifier, command): run any CLI command on a device and return the output.

When the user asks something like "show devices", "list devices", "status of router1", "interfaces of hAP ac lite", "firmware channels", "check for updates", or "execute /system/resource/print on device router1" – you MUST call the corresponding tool. If the user is ambiguous, ask for clarification (e.g., which device?).

Important for commands: Use RouterOS syntax with slashes, e.g., "/system/resource/print details" or "/interface/print", just like a path to executable program in Linux. If you write with spaces like "/system resource print", it will be error! Arguments (like "details") should be separated by a space after the command. Example: "/system/resource/print details"

After receiving tool results, summarize the information clearly for the user.`,
};

const STORAGE_KEY = 'openai-chat-config';

// ======================== API-ФУНКЦИИ (ИНСТРУМЕНТЫ) ========================

async function getDevicesList(): Promise<string> {
  try {
    const response = await api.get<Device[]>('/devices');
    const devices = response.data;
    if (!devices.length) return '📡 No devices found.';
    const lines = devices.map(d => {
      const name = d.hostname || d.board_name || d.name || d.id;
      const ip = d.address || d.management_ip || 'IP unknown';
      const statusIcon = d.status === 'up' ? '✅' : d.status === 'down' ? '❌' : '⚠️';
      return `${statusIcon} **${name}** (${d.status}) — ${ip}`;
    });
    return `📋 **Device list (${devices.length})**\n\n${lines.join('\n')}`;
  } catch (err) {
    console.error('getDevicesList failed', err);
    return '❌ Failed to retrieve device list. Please check server connection.';
  }
}

async function getDeviceStatus(identifier: string): Promise<string> {
  try {
    const devicesResp = await api.get<Device[]>('/devices');
    const device = devicesResp.data.find(d =>
      d.id === identifier ||
      d.hostname?.toLowerCase() === identifier.toLowerCase() ||
      d.board_name?.toLowerCase() === identifier.toLowerCase() ||
      d.name?.toLowerCase() === identifier.toLowerCase()
    );
    if (!device) return `❌ Device "${identifier}" not found. Use "list devices" to see available ones.`;
    const lines = [
      `🖥️ **${device.hostname || device.board_name || device.name || device.id}**`,
      `├─ ID: ${device.id}`,
      `├─ Status: ${device.status === 'up' ? '✅ up' : device.status === 'down' ? '❌ down' : '⚠️ unknown'}`,
      `├─ IP address: ${device.address || device.management_ip || '—'}`,
      `├─ Model: ${device.board_name || '—'}`,
      `├─ RouterOS version: ${device.ros_version || '—'}`,
      `├─ Uptime: ${device.uptime || '—'}`,
    ];
    if (device.internet_ok !== undefined) lines.push(`├─ Internet access: ${device.internet_ok ? '✅ yes' : '❌ no'}`);
    if (device.abnormal_reboot) lines.push(`└─ ⚠️ Abnormal reboot: ${device.abnormal_reboot}`);
    else lines.push(`└─ No abnormal reboots`);
    return lines.join('\n');
  } catch (err) {
    console.error('getDeviceStatus failed', err);
    return '❌ Failed to retrieve device status.';
  }
}

async function getDeviceInterfaces(identifier: string): Promise<string> {
  try {
    const devicesResp = await api.get<Device[]>('/devices');
    const device = devicesResp.data.find(d =>
      d.id === identifier ||
      d.hostname?.toLowerCase() === identifier.toLowerCase() ||
      d.board_name?.toLowerCase() === identifier.toLowerCase() ||
      d.name?.toLowerCase() === identifier.toLowerCase()
    );
    if (!device) return `❌ Device "${identifier}" not found.`;
    const ifaceResp = await api.get<InterfaceInfo[]>(`/devices/${device.id}/interfaces`);
    const interfaces = ifaceResp.data;
    if (!interfaces.length) return `🔌 Device **${device.hostname || device.id}** has no interfaces.`;
    const lines = interfaces.map(iface => {
      const status = iface.running ? '🟢 up' : iface.disabled ? '⚪ disabled' : '🔴 down';
      let line = `- **${iface.name}** (${iface.type || 'ether'}) — ${status}`;
      if (iface.comment) line += ` · ${iface.comment}`;
      if (iface.mac_address) line += ` · MAC: ${iface.mac_address}`;
      return line;
    });
    return `🔌 **Interfaces of ${device.hostname || device.id}**\n\n${lines.join('\n')}`;
  } catch (err) {
    console.error('getDeviceInterfaces failed', err);
    return '❌ Failed to retrieve interfaces.';
  }
}

async function getFirmwareChannelsInfo(): Promise<string> {
  try {
    const resp = await api.get<FirmwareChannelsOut>('/firmware/channels');
    const data = resp.data;
    const order = data.available_channels;
    const lines = order.map(ch => {
      const info = data.channels[ch];
      if (!info) return `- **${ch}**: no data`;
      const ok = info.last_check_ok !== false && info.version;
      return `- **${ch}**: ${info.version || '—'} ${ok ? '✅' : '⚠️'} (checked at ${new Date(info.last_check).toLocaleString()})`;
    });
    return `📦 **RouterOS channels**\n\n${lines.join('\n')}`;
  } catch (err) {
    console.error('getFirmwareChannelsInfo failed', err);
    return '❌ Failed to retrieve firmware channels.';
  }
}

async function triggerFirmwareCheck(): Promise<string> {
  try {
    await api.post('/firmware/check');
    return '🔄 Firmware update check started. New versions will appear in the channels list in a few seconds.';
  } catch (err: any) {
    const msg = err?.response?.data?.message || err.message;
    return `❌ Failed to trigger firmware check: ${msg}`;
  }
}

async function executeDeviceCommand(deviceIdentifier: string, command: string): Promise<string> {
  try {
    const devicesResp = await api.get<Device[]>('/devices');
    const device = devicesResp.data.find(d =>
      d.id === deviceIdentifier ||
      d.hostname?.toLowerCase() === deviceIdentifier.toLowerCase() ||
      d.board_name?.toLowerCase() === deviceIdentifier.toLowerCase() ||
      d.name?.toLowerCase() === deviceIdentifier.toLowerCase()
    );
    if (!device) return `❌ Device "${deviceIdentifier}" not found.`;

    // Преобразуем id в число (если он приходит строкой, но API может ждать number)
    const deviceId = typeof device.id === 'string' ? parseInt(device.id, 10) : device.id;
    if (isNaN(deviceId)) return `❌ Invalid device ID: ${device.id}`;

    // Новый эндпоинт и тело запроса
    const resp = await api.post<{ output?: string; result?: string; stdout?: string }>(
      '/cli/run',  // или '/api/v1/cli/run' – уточните по своему api.client
      {
        device_ids: [deviceId],
        command: command,
        confirm: false,
      }
    );

    let output = resp.data.output || resp.data.results || resp.data.result || resp.data.stdout;
    if (!output) return `✅ Command executed, no output returned.`;
    output = JSON.stringify(output); // А надобно будет потом нормально распарсить по-хорошему
    const truncated = output.length > 1800 ? output.slice(0, 1800) + '\n… (output truncated)' : output;
    return `🖥️ **Result of command** on device ${device.id}:\n\`\`\`\n${truncated}\n\`\`\``;
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.response?.data?.error || err.message;
    return `❌ Command execution failed: ${msg || 'unknown error'}`;
  }
}

// ======================== OPENAI FUNCTION CALLING (TOOLS) ========================

const tools = [
  {
    type: 'function',
    function: {
      name: 'get_devices_list',
      description: 'Get the list of all MikroTik devices with their statuses and IP addresses.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_device_status',
      description: 'Get detailed status of a specific device (uptime, RouterOS version, internet connectivity, etc.).',
      parameters: {
        type: 'object',
        properties: {
          identifier: { type: 'string', description: 'Device ID, hostname, board name, or name (case-insensitive partial match).' },
        },
        required: ['identifier'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_device_interfaces',
      description: 'List all network interfaces of a specific device with their statuses (up/down/disabled), comments, and MAC addresses.',
      parameters: {
        type: 'object',
        properties: {
          identifier: { type: 'string', description: 'Device ID, hostname, board name, or name.' },
        },
        required: ['identifier'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_firmware_channels',
      description: 'Get current RouterOS firmware channels (stable, testing, development) with versions and last check timestamps.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'trigger_firmware_check',
      description: 'Manually trigger a firmware update check. Useful when the user asks to check for new RouterOS updates.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_device_command',
      description: 'Execute an arbitrary CLI command on a device (e.g., "/system/resource/print", "/interface/print").',
      parameters: {
        type: 'object',
        properties: {
          device_identifier: { type: 'string', description: 'Device ID, hostname, board name, or name.' },
          command: { type: 'string', description: 'RouterOS command to execute.' },
        },
        required: ['device_identifier', 'command'],
      },
    },
  },
];

async function callTool(name: string, args: any): Promise<string> {
  switch (name) {
    case 'get_devices_list':
      return await getDevicesList();
    case 'get_device_status':
      return await getDeviceStatus(args.identifier);
    case 'get_device_interfaces':
      return await getDeviceInterfaces(args.identifier);
    case 'get_firmware_channels':
      return await getFirmwareChannelsInfo();
    case 'trigger_firmware_check':
      return await triggerFirmwareCheck();
    case 'execute_device_command':
      return await executeDeviceCommand(args.device_identifier, args.command);
    default:
      return `Unknown tool: ${name}`;
  }
}

/** 
 * Send messages to LLM, handle tool_calls recursively, return final assistant message.
 * Modifies the conversation history (adds assistant message + tool responses).
 */
async function sendWithTools(
  messages: Msg[],
  config: OpenAIConfig,
  systemPrompt: string,
  setLoading: (loading: boolean) => void,
  setError: (error: string | null) => void,
  updateMessages: (newMsgs: Msg[]) => void
): Promise<void> {
  if (!config.apiKey.trim()) {
    setError('API key is required. Please configure settings.');
    return;
  }
  if (!config.host.trim()) {
    setError('Host URL is required.');
    return;
  }

  setLoading(true);
  setError(null);

  // Convert internal messages to OpenAI format, prepend system
  const openAiMsgs: { role: string; content: string; tool_calls?: any; name?: string }[] = [];
  if (systemPrompt.trim()) {
    openAiMsgs.push({ role: 'system', content: systemPrompt });
  }
  for (const m of messages) {
    openAiMsgs.push({ role: m.who === 'me' ? 'user' : 'assistant', content: m.text });
  }

  const endpoint = `${config.host.replace(/\/$/, '')}${config.endpointPath}`;

  const makeRequest = async (msgs: any[]): Promise<any> => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: msgs,
        tools: tools,
        tool_choice: 'auto',
        stream: false,
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText.slice(0, 200)}`);
    }
    return await response.json();
  };

  try {
    let currentMessages = [...openAiMsgs];
    let finalAssistantContent: string | null = null;

    while (true) {
      const data = await makeRequest(currentMessages);
      const assistantMessage = data.choices?.[0]?.message;
      if (!assistantMessage) throw new Error('No message in response');

      // If no tool calls, we're done
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        finalAssistantContent = assistantMessage.content || '';
        break;
      }

      // Append assistant message with tool_calls to conversation
      currentMessages.push(assistantMessage);

      // Execute each tool call and append tool response messages
      for (const toolCall of assistantMessage.tool_calls) {
        const func = toolCall.function;
        let args: any = {};
        try {
          args = JSON.parse(func.arguments);
        } catch (e) {
          args = {};
        }
        const result = await callTool(func.name, args);
        currentMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });
      }
      // Continue loop – LLM will see tool outputs and decide final answer or more calls
    }

    if (finalAssistantContent !== null) {
      // Add the final assistant message to UI
      updateMessages([...messages, { who: 'bot', text: finalAssistantContent, ts: Date.now() }]);
    } else {
      throw new Error('No final response from model');
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    setError(errorMsg);
    // Optionally show error as a bot message
    updateMessages([...messages, { who: 'bot', text: `⚠️ Error: ${errorMsg}`, ts: Date.now() }]);
  } finally {
    setLoading(false);
  }
}

// ======================== КОМПОНЕНТ CHATBOT ========================

interface ChatBotProps {
  open?: boolean;
  onClose?: () => void;
  embedded?: boolean;
}

export default function ChatBot({ open = true, onClose, embedded = false }: ChatBotProps) {
  const [config, setConfig] = useState<OpenAIConfig>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      } catch {
        return DEFAULT_CONFIG;
      }
    }
    return DEFAULT_CONFIG;
  });

  const [showConfig, setShowConfig] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { who: 'bot', text: '👋 I can now use real API tools! Ask me about devices, interfaces, firmware, or execute commands. I will automatically fetch live data.\n\nTry:\n- "list devices"\n- "status of hAP ac lite"\n- "interfaces of router1"\n- "firmware channels"\n- "check for updates"\n- "execute /system/resource/print on device router1"', ts: Date.now() },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const updateConfig = (updates: Partial<OpenAIConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
  };

  const clearChat = () => {
    setMsgs([{ who: 'bot', text: 'Chat cleared. Start a new conversation!', ts: Date.now() }]);
    setError(null);
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Msg = { who: 'me', text, ts: Date.now() };
    const newMsgs = [...msgs, userMsg];
    setMsgs(newMsgs);
    setInput('');
    setError(null);

    // Call LLM with tools
    await sendWithTools(newMsgs, config, config.systemPrompt, setLoading, setError, setMsgs);
  };

  if (!open) return null;

  const wrapperCls = embedded
    ? 'card p-0 flex flex-col h-[60vh] min-h-[360px]'
    : 'fixed bottom-5 left-60 z-40 w-96 h-[560px] card p-0 flex flex-col shadow-2xl';

  return (
    <div className={wrapperCls}>
      <div className="px-4 py-3 border-b border-mk-border flex items-center gap-2 shrink-0">
        <Bot size={18} className="text-mk-accent2" />
        <div className="font-medium text-sm">AI Assistant</div>
        <span className="ml-2 text-xs text-mk-mute">Tools · Function Calling</span>

        <button
          onClick={() => setShowConfig(!showConfig)}
          className={`ml-auto p-1 rounded hover:bg-mk-panel2 transition-colors ${showConfig ? 'bg-mk-panel2 text-mk-accent' : 'text-mk-mute hover:text-mk-text'}`}
          aria-label="Settings"
          title="API Settings"
        >
          <Settings size={16} />
        </button>

        <button
          onClick={clearChat}
          className="p-1 rounded hover:bg-mk-panel2 text-mk-mute hover:text-mk-text transition-colors"
          aria-label="Clear chat"
          title="Clear conversation"
        >
          <Trash2 size={14} />
        </button>

        {!embedded && onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-mk-panel2 text-mk-mute hover:text-mk-text"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {showConfig && (
        <div className="p-3 border-b border-mk-border bg-mk-panel/30 space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-mk-mute block mb-1">Host URL</label>
              <input
                type="text"
                className="input text-xs w-full"
                value={config.host}
                onChange={(e) => updateConfig({ host: e.target.value })}
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div>
              <label className="text-xs text-mk-mute block mb-1">Endpoint path</label>
              <input
                type="text"
                className="input text-xs w-full"
                value={config.endpointPath}
                onChange={(e) => updateConfig({ endpointPath: e.target.value })}
                placeholder="/chat/completions"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-mk-mute block mb-1">API Key</label>
            <input
              type="password"
              className="input text-xs w-full"
              value={config.apiKey}
              onChange={(e) => updateConfig({ apiKey: e.target.value })}
              placeholder="sk-..."
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-mk-mute block mb-1">Model</label>
              <input
                type="text"
                className="input text-xs w-full"
                value={config.model}
                onChange={(e) => updateConfig({ model: e.target.value })}
                placeholder="gpt-3.5-turbo"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setShowConfig(false)}
                className="btn-primary text-xs py-1.5 w-full"
              >
                <Save size={12} className="inline mr-1" /> Save
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-mk-mute block mb-1">System Prompt</label>
            <textarea
              className="input text-xs w-full"
              rows={3}
              value={config.systemPrompt}
              onChange={(e) => updateConfig({ systemPrompt: e.target.value })}
              placeholder="You are a helpful assistant..."
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-3 space-y-2 text-sm">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] px-3 py-2 rounded-lg whitespace-pre-wrap ${
              m.who === 'me'
                ? 'ml-auto bg-mk-accent/20 text-mk-text'
                : 'mr-auto bg-mk-panel2 text-mk-text'
            }`}
          >
            {m.text}
          </div>
        ))}
        {loading && (
          <div className="mr-auto bg-mk-panel2 text-mk-text px-3 py-2 rounded-lg inline-flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            <span>Thinking & calling tools...</span>
          </div>
        )}
        {error && !loading && (
          <div className="mr-auto bg-red-500/20 text-red-300 px-3 py-2 rounded-lg text-xs">
            ⚠️ {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={send} className="p-2 border-t border-mk-border flex gap-2 shrink-0">
        <input
          className="input flex-1"
          placeholder="Ask about devices, interfaces, firmware, or run a command..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button
          className="btn-primary"
          type="submit"
          disabled={loading || !input.trim()}
          aria-label="Send"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </form>
    </div>
  );
}
