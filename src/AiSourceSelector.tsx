import React, { useState, useEffect, useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import {
  Box, Typography, Paper, Radio, Divider, Button, TextField,
  Alert, CircularProgress, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  List, ListItemButton, ListItemText, Chip, InputAdornment as MuiInputAdornment,
  Checkbox, FormControlLabel, Select, MenuItem, FormControl, InputLabel,
} from "@mui/material";
import CheckCircle from "@mui/icons-material/CheckCircle";
import ErrorOutline from "@mui/icons-material/ErrorOutline";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import TerminalIcon from "@mui/icons-material/Terminal";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { ClaudeIcon } from "./icons/ClaudeIcon";
import { NpmIcon } from "./icons/NpmIcon";
import { NvmIcon } from "./icons/NvmIcon";
import { WinGetIcon } from "./icons/WinGetIcon";
import InputAdornment from "@mui/material/InputAdornment";
import { useTranslation } from "react-i18next";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { DEFAULT_MODEL, CLI_MODELS, getApiKeyUrl, MODEL_METADATA, getModelReleaseDate, getModelTier, FREE_PUBLIC_PROVIDERS, DEFAULT_FREE_PROVIDER_ORDER } from "suai";
import type { AiSettings, AiProvider, FreePublicProvider } from "suai";
import { friendlyError } from "suai/renderer";
import { OllamaModelAndParams } from "./OllamaModelAndParams";
import type { OllamaParamKey } from "./OllamaModelAndParams";

// module-level cache — survives component remount, keyed by token
const _sunamoCache = new Map<string, { status: "ok" | "auth" | "error"; message?: string }>();

const API_KEY_PROVIDERS = [
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Google Gemini" },
  { id: "openrouter", label: "OpenRouter" },
] as const;

type Group = "cli" | "apikey" | "sunamo" | "free" | "ollama";

function groupOf(p: string): Group {
  if (p === "anthropic-account") return "cli";
  if (p === "sunamo") return "sunamo";
  if (p === "free") return "free";
  if (p === "ollama") return "ollama";
  return "apikey";
}

type Props = {
  settings: AiSettings;
  onChange: (s: AiSettings) => void;
  claudeAvailable: boolean | null;
  onClaudeDetected?: () => void;
  // Zdroje AI, ktere se nemaji vubec zobrazit (napr. na webu, kde funguje jen sunamo).
  hiddenSources?: Group[];
  problem?: string | null;
  devAutoFill?: { email: string; password: string } | null;
  onClearDevAutoFill?: () => void;
  devApiKeys?: { anthropic?: string; openai?: string; gemini?: string; openrouter?: string } | null;
  sunamoIsLocalhost?: boolean;
  defaultModels?: Partial<Record<string, string>>;
  showReinstall?: boolean;
  ollamaForceNotInstalled?: boolean;
  ollamaForceNoModels?: boolean;
  onOllamaModelsLoaded?: (models: string[]) => void;
  ollamaModelLabel?: React.ReactNode;
  ollamaExtra?: React.ReactNode;
  ollamaHeaderWarning?: string;
  ollamaBestParams?: { modelParamsMap: Record<string, Partial<Record<OllamaParamKey, number>>> };
};

export function AiSourceSelector({
  settings,
  onChange,
  claudeAvailable,
  onClaudeDetected: _onClaudeDetected,
  hiddenSources,
  problem,
  devAutoFill,
  onClearDevAutoFill,
  devApiKeys,
  sunamoIsLocalhost,
  defaultModels,
  showReinstall = false,
  ollamaForceNotInstalled = false,
  ollamaForceNoModels = false,
  onOllamaModelsLoaded,
  ollamaModelLabel,
  ollamaExtra,
  ollamaHeaderWarning,
  ollamaBestParams,
}: Props) {
  const getDefaultModel = (provider: string) => defaultModels?.[provider] ?? DEFAULT_MODEL[provider as keyof typeof DEFAULT_MODEL] ?? "";
  const { t } = useTranslation("suai");
  const [showApiKey, setShowApiKey] = useState(false);
  const [models, setModels] = useState<{ id: string; verified: boolean }[]>([]);
  const [modelsRefreshing, setModelsRefreshing] = useState(false);
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [modelSortAsc, setModelSortAsc] = useState(false);
  const [modelTierFilter, setModelTierFilter] = useState<Set<string>>(new Set());
  const [sunamoEmail, setSunamoEmail] = useState("");
  const [sunamoPassword, setSunamoPassword] = useState("");
  const [showSunamoPassword, setShowSunamoPassword] = useState(false);
  const [sunamoLogging, setSunamoLogging] = useState(false);
  const [sunamoError, setSunamoError] = useState<string | null>(null);
  const [sunamoClaudeStatus, setSunamoClaudeStatus] = useState<null | "checking" | "ok" | "auth" | "error">(() => {
    const cached = settings.sunamoToken ? _sunamoCache.get(settings.sunamoToken) : undefined;
    return cached?.status ?? null;
  });
  const [sunamoClaudeError, setSunamoClaudeError] = useState<string | null>(() => {
    const cached = settings.sunamoToken ? _sunamoCache.get(settings.sunamoToken) : undefined;
    return cached?.message ?? null;
  });
  const [freeDragIdx, setFreeDragIdx] = useState<number | null>(null);
  const [installLocations, setInstallLocations] = useState<{ id: string; path: string; found: boolean }[] | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installOutput, setInstallOutput] = useState<string>("");
  const [installResult, setInstallResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const installOutputRef = useRef<HTMLDivElement | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<{ installed: boolean; running: boolean; binaryPath?: string } | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaRunningModels, setOllamaRunningModels] = useState<string[]>([]);
  const [ollamaRunningRefreshing, setOllamaRunningRefreshing] = useState(false);
  const [ollamaStoppingModels, setOllamaStoppingModels] = useState<Set<string>>(new Set());
  const [ollamaModelsListRefreshing, setOllamaModelsListRefreshing] = useState(false);
  const [ollamaInstalling, setOllamaInstalling] = useState(false);
  const [ollamaInstallOutput, setOllamaInstallOutput] = useState("");
  const [ollamaInstallResult, setOllamaInstallResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [ollamaStarting, setOllamaStarting] = useState(false);
  const [ollamaStartAttempt, setOllamaStartAttempt] = useState(0);
  const [ollamaStartError, setOllamaStartError] = useState<string | null>(null);
  const ollamaOutputRef = useRef<HTMLDivElement | null>(null);

  const activeGroup = groupOf(settings.aiProvider);
  const apiKeyProvider: AiProvider =
    activeGroup === "apikey" ? settings.aiProvider : "anthropic";

  const settingsRef = useRef(settings);
  const onChangeRef = useRef(onChange);
  settingsRef.current = settings;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (activeGroup !== "apikey" || !settings.aiApiKey) return;
    const appDefault = getDefaultModel(apiKeyProvider);
    const suaiDefault = DEFAULT_MODEL[apiKeyProvider as keyof typeof DEFAULT_MODEL] ?? "";
    // Override if: no model set, OR current model equals suai global default but app prefers a different one
    const shouldOverride = !settings.aiModel || (defaultModels && settings.aiModel === suaiDefault && appDefault && appDefault !== suaiDefault);
    if (shouldOverride && appDefault) onChangeRef.current({ ...settingsRef.current, aiModel: appDefault });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.aiApiKey, settings.aiModel, activeGroup, apiKeyProvider]);

  const refreshModels = useCallback(async (provider: string, apiKey: string) => {
    if (groupOf(provider) !== "apikey") return;
    setModelsRefreshing(true);
    try {
      const result = await (window as any).electronAPI.fetchAvailableModels({ provider, apiKey });
      setModels(result);
    } finally {
      setModelsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (activeGroup === "apikey") refreshModels(settings.aiProvider, settings.aiApiKey);
  }, [settings.aiProvider, settings.aiApiKey, activeGroup, refreshModels]);

  useEffect(() => {
    if (activeGroup === "cli" && claudeAvailable !== null) {
      (window as any).electronAPI.getClaudeInstallLocations().then((locs: { id: string; path: string; found: boolean }[]) => {
        setInstallLocations(locs);
        if (locs.some((l) => l.found)) _onClaudeDetected?.();
      });
    }
  }, [activeGroup, claudeAvailable]);

  // check sunamo token once on mount if active and not yet cached
  useEffect(() => {
    if (activeGroup === "sunamo" && settings.sunamoToken && sunamoClaudeStatus === null) {
      runSunamoCheck(settings.sunamoToken);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-scroll output box
  useEffect(() => {
    if (installOutputRef.current) installOutputRef.current.scrollTop = installOutputRef.current.scrollHeight;
  }, [installOutput]);

  useEffect(() => {
    if (ollamaOutputRef.current) ollamaOutputRef.current.scrollTop = ollamaOutputRef.current.scrollHeight;
  }, [ollamaInstallOutput]);

  useEffect(() => {
    if (ollamaModels.length > 0) onOllamaModelsLoaded?.(ollamaModels);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ollamaModels]);

  useEffect(() => {
    if (activeGroup !== "ollama" || ollamaForceNotInstalled) return;
    (window as any).electronAPI.checkOllamaStatus().then((status: { installed: boolean; running: boolean; binaryPath?: string }) => {
      setOllamaStatus(status);
      if (status.running) {
        (window as any).electronAPI.getOllamaModels().then(setOllamaModels);
        fetch("http://localhost:11434/api/ps").then((r) => r.json()).then((j: any) => setOllamaRunningModels((j.models ?? []).map((m: any) => m.name as string))).catch(() => {});
      }
    });
  }, [activeGroup, ollamaForceNotInstalled]);

  const runAction = useCallback((ipcMethod: string, args: string) => {
    setInstalling(ipcMethod + ":" + args);
    setInstallOutput("");
    setInstallResult(null);
    (window as any).electronAPI.onInstallOutput((chunk: string) => {
      setInstallOutput((prev) => prev + chunk);
    });
    (window as any).electronAPI[ipcMethod](args)
      .then((r: { success: boolean; output: string; reason?: string }) => {
        const failKey = ipcMethod === "uninstallClaudeCode" ? "cliUninstallFail" : "cliInstallFail";
        const okKey = ipcMethod === "uninstallClaudeCode" ? "cliUninstallOk" : "cliInstallOk";
        // A known reason (e.g. binaryLocked) gets a clean human-readable message; otherwise show raw output.
        const failMsg = r.reason ? t(`cliInstall${r.reason[0].toUpperCase()}${r.reason.slice(1)}`) : `${t(failKey)} ${r.output}`;
        setInstallResult({ ok: r.success, msg: r.success ? t(okKey) : failMsg });
        (window as any).electronAPI.getClaudeInstallLocations().then(setInstallLocations);
      })
      .catch((err: unknown) => { setInstallResult({ ok: false, msg: String(err) }); })
      .finally(() => { (window as any).electronAPI.offInstallOutput(); setInstalling(null); });
  }, [t]);

  const runSunamoCheck = (token: string) => {
    setSunamoClaudeStatus("checking");
    setSunamoClaudeError(null);
    (window as any).electronAPI.sunamoCheckToken({ token })
      .then((r: { status: "ok" | "auth" | "error"; message?: string }) => {
        _sunamoCache.set(token, r);
        setSunamoClaudeStatus(r.status);
        setSunamoClaudeError(r.message ?? null);
      })
      .catch(() => { setSunamoClaudeStatus("error"); setSunamoClaudeError(null); });
  };

  const selectGroup = (g: Group) => {
    if (g === "cli") onChange({ ...settings, aiProvider: "anthropic-account", aiModel: settings.aiModel || DEFAULT_MODEL["anthropic-account"] || "claude-sonnet-4-6" });
    else if (g === "sunamo") {
      onChange({ ...settings, aiProvider: "sunamo" });
      if (settings.sunamoToken && sunamoClaudeStatus === null) runSunamoCheck(settings.sunamoToken);
    }
    else if (g === "free") onChange({ ...settings, aiProvider: "free", aiModel: "" });
    else if (g === "ollama") onChange({ ...settings, aiProvider: "ollama", aiModel: settings.aiModel || "" });
    else onChange({ ...settings, aiProvider: apiKeyProvider, aiModel: settings.aiModel || getDefaultModel(apiKeyProvider) });
  };

  const handleSunamoLogin = async () => {
    setSunamoLogging(true);
    setSunamoError(null);
    try {
      const { token } = await (window as any).electronAPI.sunamoLogin({ email: sunamoEmail, password: sunamoPassword });
      onChange({ ...settings, sunamoToken: token, sunamoEmail });
      setSunamoPassword("");
    } catch (err) {
      setSunamoError(friendlyError(err));
    } finally {
      setSunamoLogging(false);
    }
  };

  const handleSunamoLogout = async () => {
    const token = settings.sunamoToken;
    onChange({ ...settings, sunamoToken: "", sunamoEmail: "" });
    setSunamoEmail("");
    setSunamoPassword("");
    setSunamoError(null);
    if (token) {
      try {
        await (window as any).electronAPI.sunamoLogout({ token });
      } catch {
        // token is already cleared locally; ignore API errors
      }
    }
  };

  const isHidden = (g: Group) => !!hiddenSources?.includes(g);

  const cardSx = (active: boolean) => ({
    p: 2, display: "flex", flexDirection: "column", gap: 1.5, cursor: "pointer",
    borderColor: active ? "primary.main" : "divider",
    borderWidth: active ? 2 : 1, borderStyle: "solid", borderRadius: 2,
    transition: "border-color 0.15s",
  });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {/* CLI card */}
      {!isHidden("cli") && (
      <Paper sx={cardSx(activeGroup === "cli")} onClick={() => selectGroup("cli")}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Radio checked={activeGroup === "cli"} size="small" sx={{ p: 0 }}
            onClick={(e) => e.stopPropagation()} onChange={() => selectGroup("cli")} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Claude CLI (claude.cmd)</Typography>
            <Typography variant="caption" sx={{ opacity: 0.65 }}>{t("cliDesc")}</Typography>
          </Box>
          {activeGroup === "cli" && claudeAvailable === true && installLocations !== null && <CheckCircle fontSize="small" sx={{ color: "success.main" }} />}
          {activeGroup === "cli" && claudeAvailable === false && <Tooltip title={t("cliNotFound").replace(/ —.*$/, "")} placement="top"><ErrorOutline fontSize="small" sx={{ color: "error.main" }} /></Tooltip>}
        </Box>
        {activeGroup === "cli" && (
          <Box sx={{ pl: 3.5, display: "flex", flexDirection: "column", gap: 1 }}>
            {claudeAvailable === true && (
              <Typography variant="caption" sx={{ opacity: 0.6 }}>{t("aiAccountInfo")}</Typography>
            )}
            <Box sx={{ display: "flex", gap: 0.5 }} onClick={(e) => e.stopPropagation()}>
              {CLI_MODELS.map((m) => {
                const selected = (settings.aiModel || DEFAULT_MODEL["anthropic-account"]) === m.id;
                return (
                  <Button
                    key={m.id}
                    size="small"
                    variant={selected ? "contained" : "outlined"}
                    onClick={() => onChange({ ...settings, aiModel: m.id })}
                    sx={{ fontSize: "0.7rem", py: 0.25, px: 0.75, textTransform: "none", minWidth: 0 }}
                  >
                    {m.label}
                  </Button>
                );
              })}
            </Box>
            <>
                {installLocations ? (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }} onClick={(e) => e.stopPropagation()}>
                    {installLocations.filter((l) => l.id !== "path" && l.id !== "nvm").map((loc) => {
                      const UNINSTALL_METHODS: Record<string, string> = { npm: "npm", winget: "winget", nvm: "nvm", native: "native" };
                      const meta: { label: string; installMethod: string; icon: React.ReactNode } = ({
                        npm:    { label: t("cliMethodNpm"),    installMethod: "npm",    icon: <NpmIcon style={{ height: 10, width: "auto" }} /> },
                        winget: { label: t("cliMethodWinget"), installMethod: "winget", icon: <WinGetIcon style={{ fontSize: 13, width: "1.2em", height: "1em" }} /> },
                        native: { label: t("cliMethodNative"), installMethod: "ps1",    icon: <ClaudeIcon style={{ width: 13, height: 13 }} /> },
                        nvm:    { label: t("cliMethodNvm"),    installMethod: "npm",    icon: <NvmIcon style={{ height: 10, width: "auto" }} /> },
                      } as Record<string, { label: string; installMethod: string; icon: React.ReactNode }>)[loc.id]
                        ?? { label: loc.id, installMethod: "ps1", icon: <TerminalIcon sx={{ fontSize: 13 }} /> };
                      const uninstallMethod = UNINSTALL_METHODS[loc.id];
                      const isThisInstalling = installing === `installClaudeCode:${meta.installMethod}` && !installResult;
                      const isThisUninstalling = installing === `uninstallClaudeCode:${uninstallMethod}` && !installResult;
                      return (
                        <Box key={loc.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          {loc.found
                            ? <CheckCircle sx={{ fontSize: 14, color: "success.main", flexShrink: 0 }} />
                            : <ErrorOutline sx={{ fontSize: 14, color: "text.disabled", flexShrink: 0 }} />}
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="caption" sx={{ opacity: loc.found ? 1 : 0.5, fontFamily: "monospace", display: "block" }}>
                              {meta.label}
                            </Typography>
                            <Typography variant="caption" sx={{ opacity: 0.4, fontSize: "0.65rem", fontFamily: "monospace", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {loc.path}
                            </Typography>
                          </Box>
                          <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0, alignItems: "center" }}>
                            {loc.found && (
                              <Button size="small" variant="outlined"
                                startIcon={<FolderOpenIcon sx={{ fontSize: 15 }} />}
                                onClick={() => (window as any).electronAPI.showItemInFolder(loc.path)}
                                sx={{ fontSize: "0.7rem", py: 0.2, px: 0.75, textTransform: "none" }}>
                                {t("cliOpenFolder")}
                              </Button>
                            )}
                            {(!loc.found || showReinstall) && (
                              <Button size="small" variant="outlined"
                                startIcon={(isThisInstalling) ? <CircularProgress size={11} /> : meta.icon}
                                disabled={!!installing}
                                onClick={() => runAction("installClaudeCode", meta.installMethod)}
                                sx={{ fontSize: "0.7rem", py: 0.2, px: 0.75, textTransform: "none" }}>
                                {isThisInstalling ? t("cliInstalling") : loc.found ? t("cliReinstall") : t("cliInstall")}
                              </Button>
                            )}
                            {loc.found && uninstallMethod && (
                              <Button size="small" variant="outlined" color="error"
                                startIcon={isThisUninstalling ? <CircularProgress size={11} /> : undefined}
                                disabled={!!installing}
                                onClick={() => runAction("uninstallClaudeCode", uninstallMethod)}
                                sx={{ fontSize: "0.7rem", py: 0.2, px: 0.75, textTransform: "none" }}>
                                {isThisUninstalling ? t("cliUninstalling") : t("cliUninstall")}
                              </Button>
                            )}
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                ) : (
                  <CircularProgress size={14} />
                )}
                {/* live install/uninstall output */}
                {(installing || installOutput) && (
                  <Box ref={installOutputRef} onClick={(e) => e.stopPropagation()}
                    sx={{ mt: 0.5, p: 1, maxHeight: 140, overflowY: "auto", bgcolor: "grey.900", borderRadius: 1,
                      fontFamily: "monospace", fontSize: "0.68rem", color: "grey.100", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {installOutput || <CircularProgress size={12} sx={{ color: "grey.400" }} />}
                  </Box>
                )}
                {installResult && (
                  <Alert severity={installResult.ok ? "success" : "error"} sx={{ py: 0, fontSize: "0.75rem" }}
                    onClick={(e) => e.stopPropagation()}>
                    {installResult.msg}
                  </Alert>
                )}
            </>
            {problem && <Alert severity="warning" sx={{ py: 0, fontSize: "0.78rem" }}>{problem}</Alert>}
          </Box>
        )}
      </Paper>
      )}

      {/* API key card */}
      {!isHidden("apikey") && (
      <Paper sx={cardSx(activeGroup === "apikey")} onClick={() => selectGroup("apikey")}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Radio checked={activeGroup === "apikey"} size="small" sx={{ p: 0 }}
            onClick={(e) => e.stopPropagation()} onChange={() => selectGroup("apikey")} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{t("apiKeyTitle")}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.65 }}>{t("apiKeyDesc")}</Typography>
          </Box>
          {activeGroup === "apikey" && !!settings.aiApiKey && !!settings.aiModel && (
            <CheckCircle fontSize="small" sx={{ color: "success.main" }} />
          )}
          {activeGroup === "apikey" && (!settings.aiApiKey || !settings.aiModel) && (
            <Tooltip title={!settings.aiApiKey ? t("aiApiKey") : t("aiModel")} placement="top">
              <InfoOutlinedIcon fontSize="small" sx={{ color: "error.main" }} />
            </Tooltip>
          )}
        </Box>
        {activeGroup === "apikey" && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, pl: 3.5 }}>
            <Divider />
            <Box sx={{ display: "flex", gap: 1 }}>
              {API_KEY_PROVIDERS.map((p) => (
                <Button key={p.id} size="small"
                  variant={apiKeyProvider === p.id ? "contained" : "outlined"}
                  onClick={(e) => { e.stopPropagation(); onChange({ ...settings, aiProvider: p.id, aiModel: getDefaultModel(p.id) }); }}
                  sx={{ textTransform: "none", fontSize: "0.75rem" }}>
                  {p.label}
                </Button>
              ))}
            </Box>
            {apiKeyProvider === "openrouter" && (
              <Typography variant="caption" sx={{ opacity: 0.7, fontStyle: "italic" }}>
                {t("openrouterOneAccountNote")}
              </Typography>
            )}
            <Box sx={{ fontSize: "0.8rem", color: "text.secondary" }}>
              {t("getApiKeyAt")}{" "}
              <span style={{ textDecoration: "underline", cursor: "pointer", color: "inherit" }}
                onClick={(e) => { e.stopPropagation(); (window as any).electronAPI.openExternal(getApiKeyUrl(apiKeyProvider)); }}>
                {getApiKeyUrl(apiKeyProvider)}
              </span>
            </Box>
            {devApiKeys?.[apiKeyProvider as keyof typeof devApiKeys] && (
              <Button variant="outlined" size="small"
                onClick={(e) => { e.stopPropagation(); onChange({ ...settings, aiApiKey: devApiKeys![apiKeyProvider as keyof typeof devApiKeys]!, aiModel: getDefaultModel(apiKeyProvider) || settings.aiModel }); }}
                sx={{ alignSelf: "flex-start", fontSize: "0.75rem" }}>
                {t("apiKeyAutoFill")}
              </Button>
            )}
            <TextField label={t("aiApiKeyName")} value={settings.aiApiKeyNames?.[apiKeyProvider] ?? ""} size="small" fullWidth
              onChange={(e) => onChange({ ...settings, aiApiKeyNames: { ...settings.aiApiKeyNames, [apiKeyProvider]: e.target.value } })}
              placeholder={t("aiApiKeyNamePlaceholder")} onClick={(e) => e.stopPropagation()} />
            <TextField label={t("aiApiKey")} value={settings.aiApiKey} size="small" fullWidth
              type={showApiKey ? "text" : "password"}
              onChange={(e) => onChange({ ...settings, aiApiKey: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              InputProps={{ endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" edge="end"
                    onClick={(e) => { e.stopPropagation(); setShowApiKey((v) => !v); }}>
                    {showApiKey ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              )}} />
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }} onClick={(e) => e.stopPropagation()}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={!!settings.tryFreeFirst}
                    onChange={(e) => onChange({ ...settings, tryFreeFirst: e.target.checked })}
                  />
                }
                label={<Typography variant="body2">{t("tryFreeFirst")}</Typography>}
                sx={{ m: 0 }}
              />
              {settings.tryFreeFirst && (() => {
                const freeCount = (settings.freeProviderOrder ?? DEFAULT_FREE_PROVIDER_ORDER).length;
                const countValue = Math.min(settings.tryFreeFirstCount ?? freeCount, freeCount);
                return (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }} onClick={(e) => e.stopPropagation()}>
                    <FormControl size="small" sx={{ minWidth: 80 }}>
                      <InputLabel>{t("tryFreeFirstCount")}</InputLabel>
                      <Select
                        value={countValue}
                        label={t("tryFreeFirstCount")}
                        onChange={(e) => onChange({ ...settings, tryFreeFirstCount: Number(e.target.value) })}
                      >
                        {Array.from({ length: freeCount }, (_, i) => i + 1).map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <Tooltip title={t("tryFreeFirstCountInfo", { max: freeCount })} placement="top">
                      <InfoOutlinedIcon fontSize="small" sx={{ color: "text.secondary", cursor: "default" }} />
                    </Tooltip>
                  </Box>
                );
              })()}
            </Box>
            <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
              <TextField
                label={t("aiModel")}
                value={settings.aiModel || t("aiModelNone")}
                size="small"
                fullWidth
                helperText={t("aiModelHelper")}
                inputProps={{ readOnly: true, style: { cursor: "pointer" } }}
                onClick={(e) => { e.stopPropagation(); setModelDialogOpen(true); }}
                InputProps={{ endAdornment: (
                  <MuiInputAdornment position="end">
                    {(() => { const tier = getModelTier(settings.aiModel); return tier ? (
                      <Chip label={tier} size="small" sx={{ fontSize: "0.65rem", height: 18 }} />
                    ) : null; })()}
                  </MuiInputAdornment>
                )}}
              />
              <Box sx={{ pt: 0.5, display: "flex", flexDirection: "row", gap: 0.5 }}>
                <Button variant="outlined" size="small"
                  disabled={settings.aiModel === getDefaultModel(apiKeyProvider)}
                  onClick={(e) => { e.stopPropagation(); onChange({ ...settings, aiModel: getDefaultModel(apiKeyProvider) }); }}
                  sx={{ whiteSpace: "nowrap" }}>
                  {t("aiModelSetDefault")}
                </Button>
                <Button variant="outlined" size="small" disabled={modelsRefreshing}
                  onClick={(e) => { e.stopPropagation(); refreshModels(apiKeyProvider, settings.aiApiKey); }}
                  sx={{ whiteSpace: "nowrap" }}>
                  {modelsRefreshing && <CircularProgress size={14} sx={{ mr: 0.5 }} />}
                  {modelsRefreshing ? t("aiModelRefreshing") : t("aiModelRefresh")}
                </Button>
              </Box>
            </Box>
            {problem && (
              <Alert severity="warning" sx={{ py: 0, fontSize: "0.78rem" }}>
                {problem}{" "}
                <Typography component="span" sx={{ fontSize: "inherit", cursor: "pointer", textDecoration: "underline" }}
                  onClick={(e) => { e.stopPropagation(); (window as any).electronAPI.openExternal(getApiKeyUrl(apiKeyProvider)); }}>
                  {t("aiApiKeyManage")}
                </Typography>
              </Alert>
            )}

            {/* Model select dialog */}
            <Dialog open={modelDialogOpen} onClose={() => setModelDialogOpen(false)} maxWidth="sm" fullWidth onClick={(e) => e.stopPropagation()}>
              <DialogTitle sx={{ pb: 0 }}>{t("aiModelSelectTitle")}</DialogTitle>
              <Box sx={{ px: 3, pt: 1, pb: 1, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <Chip
                  label={modelSortAsc ? "↑ Nejstarší" : "↓ Nejnovější"}
                  size="small" variant="outlined" onClick={() => setModelSortAsc((v) => !v)}
                  sx={{ cursor: "pointer" }}
                />
                {(["low", "mid", "high"] as const).map((tier) => {
                  const active = modelTierFilter.has(tier);
                  return (
                    <Chip key={tier} label={tier} size="small"
                      color={active ? "primary" : "default"} variant={active ? "filled" : "outlined"}
                      onClick={() => setModelTierFilter((prev) => {
                        const next = new Set(prev);
                        next.has(tier) ? next.delete(tier) : next.add(tier);
                        return next;
                      })}
                      sx={{ cursor: "pointer" }}
                    />
                  );
                })}
              </Box>
              <DialogContent sx={{ p: 0 }}>
                {(() => {
                  const verifiedIds = new Set(models.map((m) => m.id));
                  const knownIds = Object.keys(MODEL_METADATA).filter((id) => {
                    if (apiKeyProvider === "anthropic") return id.startsWith("claude");
                    if (apiKeyProvider === "openai") return id.startsWith("gpt") || id.startsWith("o");
                    if (apiKeyProvider === "gemini") return id.startsWith("gemini");
                    return false;
                  });
                  const allIds = Array.from(new Set([...models.map((m) => m.id), ...knownIds]));
                  let filtered = allIds;
                  if (modelTierFilter.size > 0) {
                    filtered = filtered.filter((id) => {
                      const tier = getModelTier(id);
                      return tier && modelTierFilter.has(tier);
                    });
                  }
                  const sorted = filtered.sort((a, b) => {
                    const da = getModelReleaseDate(a) ?? "0000";
                    const db = getModelReleaseDate(b) ?? "0000";
                    return modelSortAsc ? da.localeCompare(db) : db.localeCompare(da);
                  });
                  const defaultModel = getDefaultModel(apiKeyProvider);
                  return (
                    <List dense disablePadding>
                      {sorted.map((id) => {
                        const isSelected = settings.aiModel === id;
                        const isDefault = id === defaultModel;
                        const isVerified = verifiedIds.has(id);
                        const tier = getModelTier(id);
                        const releaseDate = getModelReleaseDate(id);
                        return (
                          <ListItemButton key={id} selected={isSelected}
                            onClick={() => { onChange({ ...settings, aiModel: id }); setModelDialogOpen(false); }}
                            sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
                            <ListItemText
                              primary={
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                                  <span style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{id}</span>
                                  {isDefault && <Chip label="výchozí" size="small" color="primary" sx={{ fontSize: "0.65rem", height: 18 }} />}
                                  {isVerified && <Chip label="✓ ověřeno" size="small" color="success" sx={{ fontSize: "0.65rem", height: 18 }} />}
                                  {tier && <Chip label={tier} size="small" variant="outlined" sx={{ fontSize: "0.65rem", height: 18 }} />}
                                </Box>
                              }
                              secondary={releaseDate ? `Vydán: ${releaseDate}` : undefined}
                            />
                          </ListItemButton>
                        );
                      })}
                    </List>
                  );
                })()}
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setModelDialogOpen(false)}>{t("aiModelDialogClose")}</Button>
              </DialogActions>
            </Dialog>
          </Box>
        )}
      </Paper>
      )}

      {/* Sunamo card */}
      <Paper sx={cardSx(activeGroup === "sunamo")} onClick={() => selectGroup("sunamo")}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Radio checked={activeGroup === "sunamo"} size="small" sx={{ p: 0 }}
            onClick={(e) => e.stopPropagation()} onChange={() => selectGroup("sunamo")} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Sunamo.cz</Typography>
            <Typography variant="caption" sx={{ opacity: 0.65 }}>{t("sunamoDesc")}</Typography>
          </Box>
          {activeGroup === "sunamo" && settings.sunamoToken && sunamoClaudeStatus === "checking" && <CircularProgress size={16} />}
          {activeGroup === "sunamo" && settings.sunamoToken && (sunamoClaudeStatus === "ok" || sunamoClaudeStatus === null) && <CheckCircle fontSize="small" sx={{ color: "success.main" }} />}
          {activeGroup === "sunamo" && settings.sunamoToken && (sunamoClaudeStatus === "error" || sunamoClaudeStatus === "auth") && (
            <Tooltip title={sunamoClaudeStatus === "auth" ? "Přihlášení vypršelo" : (sunamoClaudeError ?? "Chyba serveru")} placement="top">
              <ErrorOutline fontSize="small" sx={{ color: "error.main" }} />
            </Tooltip>
          )}
          {activeGroup === "sunamo" && !settings.sunamoToken && (
            <Tooltip title={t("sunamoLogin")} placement="top">
              <InfoOutlinedIcon fontSize="small" sx={{ color: "error.main" }} />
            </Tooltip>
          )}
        </Box>
        {activeGroup === "sunamo" && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, pl: 3.5 }}>
            <Divider />
            {sunamoIsLocalhost && (
              <Paper variant="outlined" sx={{ p: 1.5, borderColor: "warning.main", bgcolor: "warning.50", display: "flex", flexDirection: "column", gap: 0.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "warning.dark", fontSize: "0.78rem" }}>
                  ⚠ {t("sunamoLocalhost")}
                </Typography>
                <Typography variant="caption" sx={{ color: "warning.dark" }}>{t("sunamoLocalhostDetail")}</Typography>
              </Paper>
            )}
            {settings.sunamoToken ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.6, display: "block" }}>{t("sunamoLoggedInAs")}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{settings.sunamoEmail}</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.7, cursor: "pointer", textDecoration: "underline" }}
                      onClick={(e) => { e.stopPropagation(); (window as any).electronAPI.openExternal("https://sunamo.cz/profil"); }}>
                      {t("sunamoProfile")}
                    </Typography>
                  </Box>
                  <Button variant="outlined" size="small" color="error"
                    onClick={(e) => { e.stopPropagation(); handleSunamoLogout(); }}>
                    {t("sunamoLogout")}
                  </Button>
                </Box>
                {sunamoClaudeStatus === "auth" && (
                  <Alert severity="warning" sx={{ fontSize: "0.78rem", py: 0.25 }}>Přihlášení na sunamo.cz vypršelo. Odhlaste se a přihlaste znovu.</Alert>
                )}
                {sunamoClaudeStatus === "error" && (
                  <Alert severity="error" sx={{ fontSize: "0.78rem", py: 0.25 }}>
                    Chyba serveru sunamo.cz{sunamoClaudeError ? `: ${sunamoClaudeError}` : ""}
                  </Alert>
                )}
              </Box>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }} onClick={(e) => e.stopPropagation()}>
                {devAutoFill && (
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Typography variant="caption" sx={{ opacity: 0.6 }}>{devAutoFill.email}</Typography>
                    <Button variant="contained" size="small" sx={{ fontSize: "0.75rem" }}
                      onClick={(e) => { e.stopPropagation(); setSunamoEmail(devAutoFill.email); setSunamoPassword(devAutoFill.password); }}>
                      {t("sunamoAutoFill")}
                    </Button>
                  </Box>
                )}
                <TextField label={t("sunamoEmail")} value={sunamoEmail} size="small" fullWidth type="email" autoComplete="email"
                  onChange={(e) => setSunamoEmail(e.target.value)} />
                <TextField label={t("sunamoPassword")} value={sunamoPassword} size="small" fullWidth type={showSunamoPassword ? "text" : "password"} autoComplete="current-password"
                  onChange={(e) => setSunamoPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSunamoLogin(); }}
                  InputProps={{ endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setShowSunamoPassword(p => !p)} edge="end">
                        {showSunamoPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  )}} />
                {sunamoError && <Alert severity="error" onClose={() => setSunamoError(null)} sx={{ fontSize: "0.8rem" }}>{sunamoError}</Alert>}
                <Button variant="contained" disabled={sunamoLogging || !sunamoEmail || !sunamoPassword}
                  startIcon={sunamoLogging ? <CircularProgress size={16} /> : undefined}
                  onClick={handleSunamoLogin}>
                  {sunamoLogging ? t("sunamoLoggingIn") : t("sunamoLoginBtn")}
                </Button>
                <Typography variant="caption" sx={{ opacity: 0.7 }}>
                  {t("sunamoNoAccount")}{" "}
                  <Typography component="span" variant="caption"
                    sx={{ cursor: "pointer", textDecoration: "underline" }}
                    onClick={(e) => { e.stopPropagation(); (window as any).electronAPI.openExternal("https://sunamo.cz/signup"); }}>
                    {t("sunamoRegister")}
                  </Typography>
                </Typography>
              </Box>
            )}
            {problem && <Alert severity="warning" sx={{ py: 0, fontSize: "0.78rem" }}>{problem}</Alert>}
          </Box>
        )}
      </Paper>

      {/* Ollama card */}
      {!isHidden("ollama") && (
      <Paper sx={cardSx(activeGroup === "ollama")} onClick={() => selectGroup("ollama")}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Radio checked={activeGroup === "ollama"} size="small" sx={{ p: 0 }}
            onClick={(e) => e.stopPropagation()} onChange={() => selectGroup("ollama")} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Ollama (lokálně)</Typography>
            <Typography variant="caption" sx={{ opacity: 0.65 }}>Modely běžící na vašem počítači</Typography>
          </Box>
          {activeGroup === "ollama" && !ollamaForceNotInstalled && ollamaStatus?.running && !ollamaForceNoModels && ollamaModels.includes(settings.aiModel) && !ollamaHeaderWarning && <CheckCircle fontSize="small" sx={{ color: "success.main" }} />}
          {activeGroup === "ollama" && (ollamaHeaderWarning || ollamaForceNotInstalled || ollamaForceNoModels || (ollamaStatus?.running && !ollamaModels.includes(settings.aiModel)) || (ollamaStatus && !ollamaStatus.running)) && (
            <Tooltip title={
              ollamaForceNotInstalled || !ollamaStatus?.installed ? "Ollama není nainstalována" :
              !ollamaStatus?.running ? "Ollama je nainstalována, ale neběží" :
              ollamaForceNoModels || ollamaModels.length === 0 ? "Ollama běží, ale nemá žádný model" :
              ollamaHeaderWarning ?? "Není vybrán model"
            } placement="top">
              <ErrorOutline fontSize="small" sx={{ color: "error.main" }} />
            </Tooltip>
          )}
        </Box>
        {activeGroup === "ollama" && (
          <Box sx={{ pl: 3.5, display: "flex", flexDirection: "column", gap: 1 }} onClick={(e) => e.stopPropagation()}>
            <Divider />
            {ollamaStatus === null && !ollamaForceNotInstalled ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <CircularProgress size={14} />
                <Typography variant="caption" sx={{ opacity: 0.6 }}>Zjišťuji stav Ollaamy...</Typography>
              </Box>
            ) : !ollamaForceNotInstalled && ollamaStatus?.running ? (
              <>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="caption" sx={{ opacity: 0.6 }}>Ollama běží na localhost:11434</Typography>
                  <Tooltip title="Zkontroluje zda Ollama stále běží a které modely jsou v RAM" placement="top">
                    <span>
                      <Button size="small" variant="text" disabled={ollamaRunningRefreshing}
                        sx={{ fontSize: "0.65rem", py: 0, px: 0.5, textTransform: "none", opacity: 0.7 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOllamaRunningRefreshing(true);
                          (window as any).electronAPI.checkOllamaStatus().then((s: { installed: boolean; running: boolean; binaryPath?: string }) => {
                            setOllamaStatus(s);
                          }).catch(() => {});
                          fetch("http://localhost:11434/api/ps").then((r) => r.json()).then((j: any) => setOllamaRunningModels((j.models ?? []).map((m: any) => m.name as string))).catch(() => {}).finally(() => setOllamaRunningRefreshing(false));
                        }}>
                        {ollamaRunningRefreshing ? <CircularProgress size={11} sx={{ mr: 0.5 }} /> : null}
                        Obnovit stav
                      </Button>
                    </span>
                  </Tooltip>
                  <Tooltip title="Znovu načte seznam nainstalovaných modelů (po: ollama pull <model>)" placement="top">
                    <span>
                      <Button size="small" variant="text" disabled={ollamaModelsListRefreshing}
                        sx={{ fontSize: "0.65rem", py: 0, px: 0.5, textTransform: "none", opacity: 0.7 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOllamaModelsListRefreshing(true);
                          (window as any).electronAPI.getOllamaModels().then(setOllamaModels).catch(() => {}).finally(() => setOllamaModelsListRefreshing(false));
                        }}>
                        {ollamaModelsListRefreshing ? <CircularProgress size={11} sx={{ mr: 0.5 }} /> : null}
                        Obnovit modely
                      </Button>
                    </span>
                  </Tooltip>
                </Box>
                {ollamaRunningModels.length > 0 && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
                    <Typography variant="caption" sx={{ opacity: 0.55 }}>V RAM:</Typography>
                    {ollamaRunningModels.map((m) => (
                      <Chip
                        key={m}
                        label={m}
                        size="small"
                        disabled={ollamaStoppingModels.has(m)}
                        onDelete={() => {
                          setOllamaStoppingModels((prev) => new Set(prev).add(m));
                          (window as any).electronAPI.stopOllamaModel(m)
                            .finally(() => {
                              fetch("http://localhost:11434/api/ps")
                                .then((r) => r.json())
                                .then((j: any) => setOllamaRunningModels((j.models ?? []).map((x: any) => x.name as string)))
                                .catch(() => {})
                                .finally(() => setOllamaStoppingModels((prev) => { const s = new Set(prev); s.delete(m); return s; }));
                            });
                        }}
                        deleteIcon={ollamaStoppingModels.has(m) ? <CircularProgress size={12} /> : undefined}
                        sx={{ fontSize: "0.65rem", height: 20 }}
                      />
                    ))}
                  </Box>
                )}
                <OllamaModelAndParams
                  label={ollamaModelLabel}
                  models={ollamaForceNoModels ? [] : ollamaModels}
                  selectedModel={settings.aiModel || undefined}
                  onModelChange={(m) => onChange({ ...settings, aiModel: m })}
                  numCtx={settings.ollamaNumCtx}
                  numPredict={settings.ollamaNumPredict}
                  temperature={settings.ollamaTemperature}
                  keepAlive={settings.ollamaKeepAlive}
                  onParamChange={(key, v) => {
                    const keyMap: Record<string, keyof typeof settings> = { numCtx: "ollamaNumCtx", numPredict: "ollamaNumPredict", temperature: "ollamaTemperature", keepAlive: "ollamaKeepAlive" };
                    onChange({ ...settings, [keyMap[key]]: v });
                  }}
                  bestParamsMap={ollamaBestParams?.modelParamsMap}
                />
                {ollamaExtra}
              </>
            ) : (
              <>
                <Alert severity="warning" sx={{ py: 0, fontSize: "0.78rem" }}>
                  {!ollamaForceNotInstalled && ollamaStatus?.installed ? "Ollama je nainstalována, ale neběží." : "Ollama není nainstalována."}
                </Alert>
                {!ollamaForceNotInstalled && ollamaStatus?.installed && (
                  <>
                    <Button size="small" variant="outlined"
                      disabled={ollamaStarting}
                      startIcon={ollamaStarting ? <CircularProgress size={11} /> : undefined}
                      onClick={() => {
                        const MAX_ATTEMPTS = 5;
                        flushSync(() => {
                          setOllamaStarting(true);
                          setOllamaStartAttempt(0);
                          setOllamaStartError(null);
                        });
                        (window as any).electronAPI.startOllama()
                          .then((r: { success: boolean; error?: string }) => {
                            if (!r.success) {
                              flushSync(() => {
                                setOllamaStartError("Nepodařilo se spustit: " + (r.error ?? "neznámá chyba"));
                                setOllamaStarting(false);
                                setOllamaStartAttempt(0);
                              });
                              return;
                            }
                            let attempts = 0;
                            const poll = () => {
                              attempts++;
                              flushSync(() => setOllamaStartAttempt(attempts));
                              (window as any).electronAPI.checkOllamaStatus()
                                .then((s: { installed: boolean; running: boolean; binaryPath?: string }) => {
                                  if (s.running) {
                                    flushSync(() => {
                                      setOllamaStatus(s);
                                      setOllamaStarting(false);
                                      setOllamaStartAttempt(0);
                                    });
                                    (window as any).electronAPI.getOllamaModels().then(setOllamaModels);
                                  } else if (attempts < MAX_ATTEMPTS) {
                                    setTimeout(poll, 2000);
                                  } else {
                                    flushSync(() => {
                                      setOllamaStartError(`Ollama se nespustila do ${MAX_ATTEMPTS * 2}s. Zkuste spustit ručně: ollama serve`);
                                      setOllamaStarting(false);
                                      setOllamaStartAttempt(0);
                                    });
                                  }
                                })
                                .catch((e: unknown) => {
                                  flushSync(() => {
                                    setOllamaStartError("Chyba při zjišťování stavu: " + String(e));
                                    setOllamaStarting(false);
                                    setOllamaStartAttempt(0);
                                  });
                                });
                            };
                            setTimeout(poll, 2000);
                          })
                          .catch((err: unknown) => {
                            flushSync(() => {
                              setOllamaStartError("Chyba IPC: " + String(err));
                              setOllamaStarting(false);
                              setOllamaStartAttempt(0);
                            });
                          });
                      }}
                      sx={{ alignSelf: "flex-start", fontSize: "0.75rem" }}
                    >
                      {ollamaStarting ? (ollamaStartAttempt > 0 ? `Čekám... (${ollamaStartAttempt}/5)` : "Spouštím...") : "Spustit Ollamu"}
                    </Button>
                    {ollamaStartError && <Alert severity="error" sx={{ py: 0, fontSize: "0.75rem" }}>{ollamaStartError}</Alert>}
                  </>
                )}
                {(ollamaForceNotInstalled || !ollamaStatus?.installed) && (
                  <>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                      <Button
                      size="small"
                      variant="outlined"
                      disabled={ollamaInstalling}
                      startIcon={ollamaInstalling ? <CircularProgress size={11} /> : undefined}
                      onClick={() => {
                        setOllamaInstalling(true);
                        setOllamaInstallOutput("");
                        setOllamaInstallResult(null);
                        (window as any).electronAPI.onInstallOutput((chunk: string) => {
                          setOllamaInstallOutput((prev) => prev + chunk);
                        });
                        (window as any).electronAPI.installOllama()
                          .then((r: { success: boolean; output: string }) => {
                            setOllamaInstallResult({ ok: r.success, msg: r.success ? "Ollama nainstalována." : `Instalace selhala: ${r.output}` });
                            if (r.success) {
                              (window as any).electronAPI.checkOllamaStatus().then((s: typeof ollamaStatus) => {
                                setOllamaStatus(s);
                                if (s?.running) (window as any).electronAPI.getOllamaModels().then(setOllamaModels);
                              });
                            }
                          })
                          .catch((err: unknown) => { setOllamaInstallResult({ ok: false, msg: String(err) }); })
                          .finally(() => { (window as any).electronAPI.offInstallOutput(); setOllamaInstalling(false); });
                      }}
                      sx={{ alignSelf: "flex-start", fontSize: "0.75rem" }}
                    >
                      {ollamaInstalling ? "Instaluji přes winget..." : "Nainstalovat Ollamu"}
                    </Button>
                      <Tooltip placement="top" title={
                        <Box sx={{ fontSize: "0.78rem", lineHeight: 1.6 }}>
                          <strong>Co se nainstaluje:</strong><br />
                          1. <strong>Ollama</strong> – runtime + HTTP server (přes winget)<br />
                          2. <strong>Model</strong> – jazykový model je potřeba stáhnout zvlášť po instalaci, např.:<br />
                          <code style={{ fontSize: "0.75rem" }}>ollama pull qwen2.5:7b</code>
                        </Box>
                      }>
                        <InfoOutlinedIcon sx={{ fontSize: 16, color: "text.secondary", cursor: "default", mt: 0.25 }} />
                      </Tooltip>
                    </Box>
                    {(ollamaInstalling || ollamaInstallOutput) && (
                      <Box ref={ollamaOutputRef}
                        sx={{ mt: 0.5, p: 1, maxHeight: 120, overflowY: "auto", bgcolor: "grey.900", borderRadius: 1,
                          fontFamily: "monospace", fontSize: "0.68rem", color: "grey.100", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {ollamaInstallOutput || <CircularProgress size={12} sx={{ color: "grey.400" }} />}
                      </Box>
                    )}
                    {ollamaInstallResult && (
                      <Alert severity={ollamaInstallResult.ok ? "success" : "error"} sx={{ py: 0, fontSize: "0.75rem" }}>
                        {ollamaInstallResult.msg}
                      </Alert>
                    )}
                  </>
                )}
              </>
            )}
            {problem && <Alert severity="warning" sx={{ py: 0, fontSize: "0.78rem" }}>{problem}</Alert>}
          </Box>
        )}
      </Paper>
      )}

      {/* Only free access card */}
      {!isHidden("free") && (
      <Paper sx={cardSx(activeGroup === "free")} onClick={() => selectGroup("free")}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Radio checked={activeGroup === "free"} size="small" sx={{ p: 0 }}
            onClick={(e) => e.stopPropagation()} onChange={() => selectGroup("free")} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{t("freeTitle")}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.65 }}>{t("freeDesc")}</Typography>
          </Box>
          {activeGroup === "free" && <CheckCircle fontSize="small" sx={{ color: "success.main" }} />}
        </Box>
        {activeGroup === "free" && (
          <Box sx={{ pl: 3.5, display: "flex", flexDirection: "column", gap: 1 }} onClick={(e) => e.stopPropagation()}>
            <Divider />
            <Typography variant="caption" sx={{ opacity: 0.6 }}>{t("freeOrderHint")}</Typography>
            {(() => {
              const order = settings.freeProviderOrder ?? DEFAULT_FREE_PROVIDER_ORDER;
              const ordered = order
                .map((id) => FREE_PUBLIC_PROVIDERS.find((p) => p.id === id))
                .filter((p): p is FreePublicProvider => p !== undefined);
              return ordered.map((fp, i) => (
                <Box
                  key={fp.id}
                  draggable
                  onDragStart={() => setFreeDragIdx(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (freeDragIdx === null || freeDragIdx === i) { setFreeDragIdx(null); return; }
                    const newOrder = [...order];
                    const [removed] = newOrder.splice(freeDragIdx, 1);
                    newOrder.splice(i, 0, removed);
                    onChange({ ...settings, freeProviderOrder: newOrder });
                    setFreeDragIdx(null);
                  }}
                  onDragEnd={() => setFreeDragIdx(null)}
                  sx={{
                    display: "flex", alignItems: "center", gap: 0.5,
                    px: 1, py: 0.5, borderRadius: 1,
                    bgcolor: freeDragIdx === i ? "action.selected" : "action.hover",
                    cursor: "grab", userSelect: "none",
                    opacity: freeDragIdx === i ? 0.5 : 1,
                  }}
                >
                  <DragIndicatorIcon sx={{ fontSize: 16, opacity: 0.4 }} />
                  <Typography variant="caption" sx={{ fontWeight: 500 }}>
                    {i + 1}.
                  </Typography>
                  <Typography variant="caption" sx={{ flex: 1 }}>
                    {fp.displayName}
                  </Typography>
                </Box>
              ));
            })()}
            {problem && <Alert severity="warning" sx={{ py: 0, fontSize: "0.78rem" }}>{problem}</Alert>}
          </Box>
        )}
      </Paper>
      )}

    </Box>
  );
}
