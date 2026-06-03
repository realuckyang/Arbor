import { useEffect, useState } from "react";
import type { Settings } from "../api";
import { api } from "../api";
import { ArrowLeft, Check, Menu } from "lucide-react";

export function SettingsPanel({ onClose, onOpenNav }: { onClose: () => void; onOpenNav?: () => void }) {
  const [form, setForm] = useState<Settings>({ apiUrl: "", apiKey: "", model: "", system: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => { api.getSettings().then((r) => setForm(r.settings)); }, []);

  const save = async () => {
    await api.saveSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const set = (k: keyof Settings, v: string) => setForm({ ...form, [k]: v });

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-bg">
      <div className="flex items-center gap-3 px-3 md:px-6 py-2.5 border-b border-border">
        {onOpenNav && (
          <button
            onClick={onOpenNav}
            className="md:hidden w-7 h-7 rounded flex items-center justify-center text-text-dim hover:text-text hover:bg-bg-hover transition-colors"
          >
            <Menu size={16} />
          </button>
        )}
        <button
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center text-text-faint hover:text-text hover:bg-bg-hover transition-colors"
        >
          <ArrowLeft size={14} />
        </button>
        <span className="text-[14px] font-medium text-text">设置</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-12 pt-10 pb-3">
          <div className="text-3xl mb-1">⚙️</div>
          <h1 className="text-[28px] md:text-[36px] font-bold text-text leading-tight">模型配置</h1>
        </div>

        <div className="px-4 md:px-12 pb-12 max-w-2xl flex flex-col gap-5">
          <Field label="API URL">
            <input
              className="input"
              value={form.apiUrl}
              onChange={(e) => set("apiUrl", e.target.value)}
              placeholder="https://api.openai.com/v1/chat/completions"
            />
          </Field>

          <Field label="API Key">
            <input
              className="input"
              type="password"
              value={form.apiKey}
              onChange={(e) => set("apiKey", e.target.value)}
            />
          </Field>

          <Field label="Model">
            <input
              className="input"
              value={form.model}
              onChange={(e) => set("model", e.target.value)}
              placeholder="gpt-4o / deepseek-chat / ..."
            />
          </Field>

          <Field label="Default System Prompt">
            <textarea
              className="input min-h-24 resize-y"
              rows={4}
              value={form.system}
              onChange={(e) => set("system", e.target.value)}
            />
          </Field>

          <button
            onClick={save}
            className={[
              "self-start flex items-center gap-1.5 px-4 py-1.5 rounded text-[14px] font-medium transition-colors",
              saved ? "bg-success/10 text-success" : "bg-accent text-white hover:opacity-85",
            ].join(" ")}
          >
            {saved ? <><Check size={13} /> 已保存</> : "保存"}
          </button>
        </div>
      </div>

      {/* inline styles for the Field input via global */}
      <style>{`
        .input {
          width: 100%;
          padding: 0.55rem 0.8rem;
          border-radius: 4px;
          border: 1px solid var(--color-border);
          background: white;
          color: var(--color-text);
          font-size: 15px;
          outline: none;
          font-family: inherit;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .input:focus {
          border-color: var(--color-accent);
          box-shadow: 0 0 0 2px rgba(35,131,226,0.15);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium uppercase tracking-wider text-text-faint">{label}</span>
      {children}
    </label>
  );
}
