import React, { useState } from "react";
import { Box, Button, TextField, Typography, Alert, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Divider } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { Tooltip } from "@mui/material";
import { useTranslation } from "react-i18next";

export type OllamaParamKey = "numCtx" | "numPredict" | "temperature" | "keepAlive";

type Props = {
  label?: React.ReactNode;
  models: string[];
  selectedModel: string | undefined;
  onModelChange: (model: string) => void;
  numCtx: number | undefined;
  numPredict: number | undefined;
  temperature: number | undefined;
  keepAlive: number | undefined;
  onParamChange: (key: OllamaParamKey, value: number) => void;
  /**
   * Map of known model names to their optimal params.
   * If provided, shows "best params" button and "known models" dialog.
   */
  bestParamsMap?: Record<string, Partial<Record<OllamaParamKey, number>>>;
};

const PARAM_DEFS = [
  { key: "numCtx" as OllamaParamKey, label: "num_ctx", defaultVal: 1024, step: 1, min: 0, tooltip: "Velikost context window v tokenech. Menší = rychlejší. Doporučeno: 1024 (prompty v této appce jsou max ~450 tokenů)." },
  { key: "numPredict" as OllamaParamKey, label: "num_predict", defaultVal: 768, step: 1, min: 0, tooltip: "Max. počet tokenů v odpovědi. Menší = rychlejší. Doporučeno: 768 (evaluace + překlad se vejdou)." },
  { key: "temperature" as OllamaParamKey, label: "temperature", defaultVal: 0, step: 0.1, min: 0, tooltip: "0 = deterministický výstup, bez vzorkování. Doporučeno: 0 pro překlad a hodnocení." },
  { key: "keepAlive" as OllamaParamKey, label: "keep_alive (s)", defaultVal: -1, step: 1, min: -1, tooltip: "Jak dlouho zůstane model v RAM po posledním dotazu. -1 = navždy (doporučeno — jinak se model po 5 min uvolní a znovu načte)." },
] as const;

function paramKeyLabel(key: string): string {
  if (key === "numCtx") return "num_ctx";
  if (key === "numPredict") return "num_predict";
  if (key === "keepAlive") return "keep_alive";
  return key;
}

export function OllamaModelAndParams({ label, models, selectedModel, onModelChange, numCtx, numPredict, temperature, keepAlive, onParamChange, bestParamsMap }: Props) {
  const { t } = useTranslation("suai");
  const [knownModelsOpen, setKnownModelsOpen] = useState(false);
  const [dialogPreview, setDialogPreview] = useState<string | undefined>(undefined);

  const values: Record<OllamaParamKey, number | undefined> = { numCtx, numPredict, temperature, keepAlive };
  const isKnownModel = !!selectedModel && !!bestParamsMap?.[selectedModel];
  const currentBestParams = selectedModel ? bestParamsMap?.[selectedModel] : undefined;

  const applyParams = (params: Partial<Record<OllamaParamKey, number>>) => {
    for (const [k, v] of Object.entries(params) as [OllamaParamKey, number][]) {
      onParamChange(k, v);
    }
  };

  const knownModelKeys = bestParamsMap ? Object.keys(bestParamsMap).sort() : [];

  const openDialog = () => { setDialogPreview(selectedModel); setKnownModelsOpen(true); };
  // The model shown in dialog params section — updates immediately on chip click
  const displayModel = dialogPreview ?? selectedModel;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {label}
      {models.length > 0 ? (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          {models.map((m) => (
            <Button
              key={m}
              size="small"
              variant={selectedModel === m ? "contained" : "outlined"}
              onClick={() => onModelChange(m)}
              sx={{ fontSize: "0.7rem", py: 0.25, px: 0.75, textTransform: "none", minWidth: 0 }}
            >
              {m}
            </Button>
          ))}
        </Box>
      ) : (
        <Alert severity="info" sx={{ py: 0, fontSize: "0.78rem" }}>
          {t("ollama.noModels")}
        </Alert>
      )}
      {!selectedModel && models.length > 0 && (
        <Typography variant="caption" sx={{ color: "warning.main" }}>{t("ollama.selectModelAbove")}</Typography>
      )}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1, alignItems: "center" }}>
        {PARAM_DEFS.map(({ key, label: paramLabel, defaultVal, step, min, tooltip }) => (
          <Box key={key} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <TextField
              label={paramLabel}
              type="number"
              size="small"
              value={values[key] ?? defaultVal}
              onChange={(e) => {
                const v = Number(e.target.value);
                onParamChange(key, isNaN(v) ? defaultVal : v);
              }}
              sx={{ width: 115 }}
              inputProps={{ step, min }}
            />
            <Tooltip title={tooltip} placement="top">
              <InfoOutlinedIcon sx={{ fontSize: 16, color: "text.secondary", cursor: "default" }} />
            </Tooltip>
          </Box>
        ))}
        {bestParamsMap !== undefined && (
          <Tooltip
            title={t(isKnownModel ? "ollama.bestParamsTooltipKnown" : "ollama.bestParamsTooltipUnknown")}
            placement="top"
          >
            <span>
              <Button
                size="small"
                variant={isKnownModel ? "contained" : "outlined"}
                color={isKnownModel ? "primary" : "inherit"}
                disabled={!selectedModel || !currentBestParams}
                onClick={() => { if (currentBestParams) applyParams(currentBestParams); }}
                sx={{ fontSize: "0.7rem", py: 0.5, textTransform: "none", whiteSpace: "nowrap" }}
              >
                {t(isKnownModel ? "ollama.bestParamsKnown" : "ollama.bestParamsUnknown")}
              </Button>
            </span>
          </Tooltip>
        )}
        {knownModelKeys.length > 0 && (
          <Button
            size="small"
            variant="text"
            onClick={openDialog}
            sx={{ fontSize: "0.7rem", py: 0.5, textTransform: "none", opacity: 0.75, whiteSpace: "nowrap" }}
          >
            {t("ollama.knownModelsBtn")}
          </Button>
        )}
      </Box>

      {knownModelKeys.length > 0 && (
        <Dialog open={knownModelsOpen} onClose={() => setKnownModelsOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
              {label && <Box sx={{ opacity: 0.6 }}>{label}</Box>}
              <Box>{t("ollama.knownModelsTitle")}</Box>
            </Box>
          </DialogTitle>
          <DialogContent>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 2 }}>
              {knownModelKeys.map((m) => {
                const installed = models.includes(m);
                const isSelected = m === selectedModel;
                const isPreviewing = m === dialogPreview && m !== selectedModel;
                return (
                  <Tooltip
                    key={m}
                    title={t(installed ? "ollama.knownModelsInstalled" : "ollama.knownModelsNotInstalled")}
                    placement="top"
                  >
                    <Chip
                      label={m}
                      size="small"
                      color={isSelected ? "primary" : installed ? "success" : "default"}
                      variant={isSelected || installed ? "filled" : "outlined"}
                      clickable={installed}
                      onClick={installed ? () => {
                        setDialogPreview(m);
                        onModelChange(m);
                        const p = bestParamsMap![m];
                        if (p) applyParams(p);
                      } : undefined}
                      sx={{
                        opacity: installed ? 1 : 0.5,
                        fontSize: "0.7rem",
                        outline: isPreviewing ? "2px solid" : undefined,
                        outlineColor: isPreviewing ? "primary.main" : undefined,
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Box>

            {displayModel && bestParamsMap![displayModel] && (
              <>
                <Divider sx={{ mb: 1.5 }} />
                <Typography variant="body2" sx={{ mb: 1 }}>
                  {t("ollama.knownModelsParams", { model: displayModel })}
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                  {(Object.entries(bestParamsMap![displayModel]) as [OllamaParamKey, number][]).map(([key, val]) => (
                    <Chip key={key} size="small" variant="outlined" label={`${paramKeyLabel(key)} = ${val}`} />
                  ))}
                </Box>
              </>
            )}

            <Alert severity="info" sx={{ mt: 2, py: 0.5, fontSize: "0.78rem" }}>
              {t("ollama.knownModelsNote")}
            </Alert>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setKnownModelsOpen(false)}>{t("ollama.close")}</Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
