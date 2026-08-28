import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { applyDigits, createDemoSession, DemoSessionError, isCompleteCode, normalizeCodeInput } from "@/lib/demoSession";
import { useDemo } from "@/demo/DemoProvider";

/**
 * Understated demo entry inside the existing gateway. Collapsed by default:
 * a single quiet line. Expanded: four digit cells, with an offline preview
 * fallback when the demo service has not been deployed.
 */
export default function DemoAccess({ disabled }: { disabled?: boolean }) {
  const { adopt } = useDemo();
  const [open, setOpen] = useState(false);
  const [cells, setCells] = useState<string[]>(["", "", "", ""]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const submittedRef = useRef("");

  useEffect(() => {
    if (open) inputs.current[0]?.focus();
  }, [open]);

  const submit = async (code: string) => {
    if (submittedRef.current === code && status === "error") return;
    submittedRef.current = code;
    setStatus("loading");
    setMessage("");
    try {
      const session = await createDemoSession(code);
      adopt(session);
    } catch (e: any) {
      console.error("[demo-session]", { stage: "access-failed", code: e instanceof DemoSessionError ? e.code : "UNKNOWN", message: e?.message });
      setStatus("error");
      setMessage(e instanceof DemoSessionError ? `${e.code}: ${e.message}` : "DEMO_SESSION_CREATE_FAILED: Demo access failed.");
      setCells(["", "", "", ""]);
      inputs.current[0]?.focus();
    }
  };

  const write = (raw: string, index: number) => {
    const next = applyDigits(cells, raw, index);
    setCells(next);
    if (status === "error") {
      setStatus("idle");
      setMessage("");
    }
    const filled = normalizeCodeInput(raw).length;
    const focusAt = Math.min(index + Math.max(filled, 1), 3);
    inputs.current[focusAt]?.focus();
    if (isCompleteCode(next)) void submit(next.join(""));
  };

  if (!open) {
    return (
      <div className="mt-8 border-t border-hairline pt-6">
        <button
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="group text-left disabled:opacity-50"
        >
          <span className="block text-[13px] font-medium tracking-tight text-white/70 group-hover:text-white transition-colors">
            Explore Demo
          </span>
          <span className="mt-1 block text-[12px] leading-relaxed text-white/35">
            Preview the EntropyLite operating environment.
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8 border-t border-hairline pt-6">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium tracking-tight text-white/80">Demo Access</span>
        <button
          onClick={() => {
            setOpen(false);
            setCells(["", "", "", ""]);
            setStatus("idle");
            setMessage("");
          }}
          className="text-[11.5px] tracking-tight text-white/35 hover:text-white/70 transition-colors"
        >
          Cancel
        </button>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-white/35">Enter your access code.</p>

      <div className="mt-4 flex gap-2.5" role="group" aria-label="Demo access code">
        {cells.map((cell, i) => (
          <input
            key={i}
            ref={(el) => (inputs.current[i] = el)}
            value={cell}
            onChange={(e) => write(e.target.value, i)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !cells[i] && i > 0) {
                e.preventDefault();
                const next = [...cells];
                next[i - 1] = "";
                setCells(next);
                inputs.current[i - 1]?.focus();
              }
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData?.getData?.("text") ?? "";
              if (!pasted) return;
              e.preventDefault();
              write(pasted, 0);
            }}
            inputMode="numeric"
            type="tel"
            autoComplete="one-time-code"
            maxLength={4}
            disabled={status === "loading"}
            aria-label={`Digit ${i + 1}`}
            data-testid={`demo-code-${i}`}
            className={`h-12 w-12 bg-white/[0.04] text-center mkt-num text-[16px] text-white outline-none border transition-colors duration-150 ${
              status === "error" ? "border-loss/70" : "border-hairline-strong focus:border-white/45"
            } disabled:opacity-60`}
          />
        ))}
        {status === "loading" && (
          <span className="flex items-center pl-1 text-white/45" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" />
          </span>
        )}
      </div>

      {message && (
        <p role="alert" className="mt-3 text-[11.5px] tracking-tight text-loss/90">
          {message}
        </p>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-white/25">
        Demo sessions are read-only and expire automatically.
      </p>
    </div>
  );
}
