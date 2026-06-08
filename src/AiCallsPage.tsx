import React, { useState, useEffect } from "react";
import { H1 } from "@sunamo/sureact19/components/headers/H1";
import {
  Alert,
  Box,
  Chip,
  Collapse,
  Divider,
  IconButton,
  Paper,
  Tooltip,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { useTranslation } from "react-i18next";
import type { AiCallEntry } from "suai";

type Props = { entries: AiCallEntry[] };

export function AiCallsPage({ entries }: Props) {
  const { t } = useTranslation("suai");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 10000);
    return () => clearInterval(id);
  }, []);

  function timeAgo(iso: string): string {
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 60) return t("aiCalls.timeAgo.seconds", { n: secs });
    if (secs < 3600) return t("aiCalls.timeAgo.minutes", { n: Math.floor(secs / 60) });
    return t("aiCalls.timeAgo.hours", { n: Math.floor(secs / 3600) });
  }

  if (entries.length === 0) {
    return (
      <Box sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2 }}>
        <H1>{t("aiCalls.pageTitle")}</H1>
        <Alert severity="info">{t("aiCalls.empty")}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1, overflow: "auto", height: "100%", boxSizing: "border-box" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
        <H1>{t("aiCalls.pageTitle")}</H1>
      </Box>
      {[...entries].reverse().map((e) => (
        <Paper key={e.id} variant="outlined" sx={{ p: 1.5, borderColor: e.status === "error" ? "error.main" : "divider" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Typography variant="caption" sx={{ color: "text.secondary", minWidth: 60 }}>
              #{e.id}
            </Typography>
            <Chip label={t(`aiCalls.operations.${e.operation}`, e.operation)} size="small" variant="outlined" sx={{ fontSize: "0.7rem" }} />
            <Chip label={t(`aiCalls.providers.${e.provider}`, e.provider)} size="small" color="primary" variant="outlined" sx={{ fontSize: "0.7rem" }} />
            <Chip label={e.model || "—"} size="small" variant="outlined" sx={{ fontSize: "0.7rem", maxWidth: 180, overflow: "hidden" }} />
            <Chip
              label={e.status === "error" ? "ERROR" : `${e.durationMs} ms`}
              size="small"
              color={e.status === "error" ? "error" : e.durationMs > 5000 ? "warning" : "success"}
              sx={{ fontSize: "0.7rem" }}
            />
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {t("aiCalls.promptLen", { chars: e.promptLength, respChars: e.responseLength })}
            </Typography>
            {e.sentence && (
              <Typography variant="caption" sx={{ color: "text.primary", fontStyle: "italic", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                "{e.sentence}"
              </Typography>
            )}
            <Box sx={{ flex: 1 }} />
            <Tooltip title={new Date(e.timestamp).toLocaleTimeString()}>
              <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.65rem" }}>
                {timeAgo(e.timestamp)}
              </Typography>
            </Tooltip>
            <Tooltip title={expanded === e.id ? t("aiCalls.collapse") : t("aiCalls.expand")}>
              <IconButton size="small" onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                {expanded === e.id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Box>
          {e.status === "error" && e.error && (
            <Typography variant="caption" sx={{ color: "error.main", display: "block", mt: 0.5 }}>
              {e.error}
            </Typography>
          )}
          <Collapse in={expanded === e.id}>
            <Divider sx={{ my: 1 }} />
            <Typography variant="caption" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
              {t("aiCalls.prompt")}
            </Typography>
            <Box
              component="pre"
              sx={{ m: 0, p: 1, bgcolor: "action.hover", borderRadius: 1, fontSize: "0.7rem", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 300, overflow: "auto" }}
            >
              {e.prompt}
            </Box>
            {e.response && (
              <>
                <Typography variant="caption" sx={{ fontWeight: 600, display: "block", mt: 1, mb: 0.5 }}>
                  {t("aiCalls.response")}
                </Typography>
                <Box
                  component="pre"
                  sx={{ m: 0, p: 1, bgcolor: "action.hover", borderRadius: 1, fontSize: "0.7rem", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 200, overflow: "auto" }}
                >
                  {e.response}
                </Box>
              </>
            )}
          </Collapse>
        </Paper>
      ))}
    </Box>
  );
}
