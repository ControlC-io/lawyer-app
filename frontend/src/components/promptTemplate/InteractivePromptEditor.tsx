import React, { useCallback, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  tokenize,
  stateKey,
  type Token,
  type PromptValues,
} from "@/lib/promptTemplate";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

interface InteractivePromptEditorProps {
  template: string;
  promptValues?: PromptValues;
  onChange: (values: PromptValues) => void;
  className?: string;
}

export function InteractivePromptEditor({
  template,
  promptValues: initialValues = {},
  onChange,
  className,
}: InteractivePromptEditorProps) {
  const [values, setValues] = useState<PromptValues>(() => ({ ...initialValues }));

  const setVal = useCallback(
    (type: string, key: string, value: string | string[] | string[][] | boolean) => {
      setValues((prev) => {
        const next = { ...prev, [stateKey(type, key)]: value };
        onChange(next);
        return next;
      });
    },
    [onChange]
  );

  const getVal = useCallback(
    (type: string, key: string, def: string | string[] | string[][] | boolean) => {
      const k = stateKey(type, key);
      const v = values[k];
      if (v !== undefined && v !== null) return v;
      return def;
    },
    [values]
  );

  const tokens = useMemo(() => tokenize(template), [template]);

  const renderTokens = useCallback(
    (tokList: Token[]) => {
      const out: React.ReactNode[] = [];
      tokList.forEach((t) => {
        if (t.type === "static") {
          out.push(<span key={out.length}>{t.text}</span>);
          return;
        }
        if (t.type === "hidden") return;
        if (t.type === "info") {
          out.push(
            <Alert
              key={`info-${out.length}-${t.message.slice(0, 30)}`}
              className="my-2 border-primary/30 bg-primary/5 text-sm"
            >
              <Info className="h-4 w-4 text-primary" />
              <AlertDescription className="text-muted-foreground pl-7">
                {t.message || "Info"}
              </AlertDescription>
            </Alert>
          );
          return;
        }
        if (t.type === "variable") {
          out.push(
            <span key={stateKey("variable", t.key)} className="italic text-muted-foreground">
              {t.value}
            </span>
          );
          return;
        }
        if (t.type === "text") {
          const val = getVal("text", t.key, "") as string;
          out.push(
            <Input
              key={stateKey("text", t.key)}
              type="text"
              className="inline-flex w-auto min-w-[80px] max-w-[200px] font-mono text-sm border-b-2 border-primary/50 bg-transparent shadow-none focus-visible:ring-0"
              placeholder={t.placeholder || t.key}
              value={val}
              onChange={(e) => setVal("text", t.key, e.target.value)}
            />
          );
          return;
        }
        if (t.type === "textarea") {
          const val = getVal("textarea", t.key, "") as string;
          out.push(
            <Textarea
              key={stateKey("textarea", t.key)}
              className="mt-1 min-h-[60px] font-mono text-sm"
              placeholder={t.key}
              value={val}
              onChange={(e) => setVal("textarea", t.key, e.target.value)}
            />
          );
          return;
        }
        if (t.type === "number") {
          const val = getVal("number", t.key, String(t.min)) as string;
          out.push(
            <Input
              key={stateKey("number", t.key)}
              type="number"
              className="inline-flex w-[70px] font-mono text-sm"
              min={t.min}
              max={t.max}
              value={val}
              onChange={(e) => setVal("number", t.key, e.target.value)}
            />
          );
          return;
        }
        if (t.type === "select") {
          const cur = (getVal("select", t.key, t.opts[0]) as string) || t.opts[0];
          out.push(
            <Select
              key={stateKey("select", t.key)}
              value={cur}
              onValueChange={(v) => setVal("select", t.key, v)}
            >
              <SelectTrigger className="inline-flex w-auto min-w-[100px] font-mono text-sm h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {t.opts.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
          return;
        }
        if (t.type === "multiselect") {
          const cur = (getVal("multiselect", t.key, []) as string[]) || [];
          out.push(
            <span key={stateKey("multiselect", t.key)} className="inline-flex flex-wrap gap-1">
              {t.opts.map((o) => {
                const on = cur.includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    className={`text-xs font-mono px-2 py-0.5 rounded-full border transition-colors ${
                      on ? "bg-primary/15 text-primary border-primary/40" : "bg-muted/50 border-border"
                    }`}
                    onClick={() => {
                      const next = on ? cur.filter((x) => x !== o) : [...cur, o];
                      setVal("multiselect", t.key, next);
                    }}
                  >
                    {o}
                  </button>
                );
              })}
            </span>
          );
          return;
        }
        if (t.type === "list") {
          let arr = getVal("list", t.key, [""]) as string[];
          if (!Array.isArray(arr)) arr = [""];
          out.push(
            <div key={stateKey("list", t.key)} className="block my-1 space-y-1">
              {arr.map((v, ri) => (
                <div key={ri} className="flex gap-1 items-center">
                  <span className="text-muted-foreground font-mono">-</span>
                  <Input
                    className="flex-1 font-mono text-sm h-8"
                    placeholder={`Item ${ri + 1}`}
                    value={v}
                    onChange={(e) => {
                      const next = [...arr];
                      next[ri] = e.target.value;
                      setVal("list", t.key, next);
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      const next = arr.filter((_, i) => i !== ri);
                      setVal("list", t.key, next.length ? next : [""]);
                    }}
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs font-mono text-primary"
                onClick={() => setVal("list", t.key, [...arr, ""])}
              >
                + Add item
              </Button>
            </div>
          );
          return;
        }
        if (t.type === "table") {
          let rows = getVal("table", t.key, [t.cols.map(() => "")]) as string[][];
          if (!Array.isArray(rows) || rows.length === 0) rows = [t.cols.map(() => "")];
          out.push(
            <div key={stateKey("table", t.key)} className="border rounded-md overflow-hidden my-1">
              <div className="flex bg-muted/50 border-b">
                {t.cols.map((c, i) => (
                  <div key={i} className="flex-1 min-w-0 p-2">
                    <Input
                      readOnly
                      className="h-8 font-mono text-xs font-medium text-muted-foreground border-0 bg-transparent"
                      value={c}
                    />
                  </div>
                ))}
              </div>
              {rows.map((row, ri) => (
                <div key={ri} className="flex border-b last:border-b-0">
                  {t.cols.map((_, ci) => (
                    <div key={ci} className="flex-1 min-w-0 p-1">
                      <Input
                        className="h-8 font-mono text-xs"
                        placeholder={t.cols[ci]}
                        value={row[ci] ?? ""}
                        onChange={(e) => {
                          const next = rows.map((r) => [...r]);
                          next[ri][ci] = e.target.value;
                          setVal("table", t.key, next);
                        }}
                      />
                    </div>
                  ))}
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                className="w-full rounded-none text-xs text-muted-foreground"
                onClick={() => setVal("table", t.key, [...rows, t.cols.map(() => "")])}
              >
                + Row
              </Button>
            </div>
          );
          return;
        }
        if (t.type === "if") {
          const on = (getVal("if", t.key, false) as boolean) || false;
          const innerTokens = tokenize(t.inner);
          out.push(
            <span key={stateKey("if", t.key)} className="inline-flex items-start gap-2 flex-wrap">
              <Switch checked={on} onCheckedChange={(v) => setVal("if", t.key, v)} className="mt-0.5 shrink-0" />
              <Label className="text-xs font-mono text-muted-foreground leading-8 shrink-0">{t.key.replace(/_/g, " ")}</Label>
              <span className={on ? "basis-full w-full mt-0.5" : "basis-full w-full mt-0.5 opacity-40 pointer-events-none"}>
                {renderTokens(innerTokens)}
              </span>
            </span>
          );
          return;
        }
        if (t.type === "switch") {
          const sel = (getVal("select", t.key, "") as string) || "";
          const caseRe = /\{\{case:([^}]+)\}\}([\s\S]*?)\{\{\/case\}\}/g;
          let m: RegExpExecArray | null;
          let content: React.ReactNode = null;
          while ((m = caseRe.exec(t.body)) !== null) {
            if (m[1].trim() === sel) {
              content = <span className="italic text-muted-foreground">{m[2].trim()}</span>;
              break;
            }
          }
          out.push(<span key={stateKey("switch", t.key)}>{content}</span>);
        }
      });
      return out;
    },
    [getVal, setVal]
  );

  return (
    <div className={className}>
      <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap break-words [&_input]:align-baseline [&_button]:align-middle">
        {renderTokens(tokens)}
      </div>
    </div>
  );
}
