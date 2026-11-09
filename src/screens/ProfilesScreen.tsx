import React, { useEffect, useState } from "react";
import { Alert, ScrollView, Switch, Text, View } from "react-native";
import { Btn, Card, Chip, Field, H1, H2, P, Screen } from "../components/ui";
import { useAppStore } from "../store/useAppStore";
import { AiProfile, ProviderRole, ProviderType } from "../types";
import {
  createProfile,
  deleteProfile,
  listProfiles,
  PRESETS,
  upsertProfile,
} from "../services/providers";
import { deleteApiKey, getApiKey, maskKey, saveApiKey } from "../services/keys";
import { buildProvider } from "../llm/router";
import { spacing } from "../theme";

export function ProfilesScreen() {
  const theme = useAppStore((s) => s.theme);
  const refresh = useAppStore((s) => s.refresh);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const [profiles, setProfiles] = useState<AiProfile[]>([]);
  const [edit, setEdit] = useState<AiProfile | null>(null);
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const load = async () => {
    try {
      setProfiles(await listProfiles());
    } catch (e) {
      setError(`Chargement des profils impossible : ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const addPreset = async (p: (typeof PRESETS)[number]) => {
    setError("");
    try {
      const created = await createProfile({
        name: p.label,
        type: p.type,
        baseUrl: p.baseUrl,
        model: p.model,
        supportsNativePdf: p.supportsNativePdf ?? p.type === "gemini",
        supportsVision: p.supportsVision ?? true,
        maxContext: p.maxContext,
      });
      if (p.allowEmptyKey) await saveApiKey(created.id, "nem");
      await open(created);
      await load();
      await refresh();
    } catch (e) {
      setError(`Ajout impossible : ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const addCustom = async () => {
    setError("");
    try {
      const created = await createProfile({
        name: "Autre fournisseur",
        type: "openai",
        baseUrl: "",
        model: "",
        supportsVision: false,
        supportsNativePdf: false,
        maxContext: 8192,
      });
      await open(created);
      await load();
      await refresh();
    } catch (e) {
      setError(`Ajout impossible : ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const open = async (p: AiProfile) => {
    setEdit(p);
    const k = await getApiKey(p.id);
    setKey(k);
    setShowKey(false);
  };

  const save = async () => {
    if (!edit) return;
    setInfo("");
    setError("");
    try {
      await upsertProfile(edit);
      if (key) await saveApiKey(edit.id, key.trim());
      await load();
      await refresh();
      setInfo("Profil et cle enregistres sur cet appareil.");
    } catch (e) {
      setError(`Enregistrement impossible : ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const test = async () => {
    if (!edit) return;
    setTesting(true);
    setInfo("");
    setError("");
    try {
      if (key) await saveApiKey(edit.id, key.trim());
      await upsertProfile(edit);
      const provider = await buildProvider(edit);
      const started = Date.now();
      const res = await withTimeout(
        provider.chat([{ role: "user", content: "Reponds uniquement: OK" }], {
          maxTokens: 16,
          temperature: 0,
        }),
        120000
      );
      const ms = Date.now() - started;
      setInfo(
        `Connexion OK (${ms} ms) : ${(res.text || "reponse vide").slice(0, 120)}`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const local = /8090|127\.0\.0\.1|192\.168\.|nemapi/i.test(`${edit.baseUrl} ${edit.name} ${msg}`);
      setError(
        local
          ? msg
          : `${msg}${/fetch|network|Failed/i.test(msg) ? " (CORS/HTTPS possible depuis le navigateur)" : ""}`
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12, paddingBottom: 48 }}>
        <H1>Profils IA</H1>
        <P muted>Les cles ne quittent jamais le telephone, sauf vers le fournisseur choisi.</P>
        <P muted>
          Tu peux utiliser n'importe quel service compatible OpenAI (/chat/completions) ou Gemini,
          meme s'il n'apparait pas ci-dessous. NemApiBridge : passerelle locale sur le telephone
          (http://127.0.0.1:8090/v1, modele = nom du provider, ex. DeepSeek). Cle facultative.
        </P>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {PRESETS.map((p) => (
            <Chip key={p.label} label={`+ ${p.label}`} onPress={() => addPreset(p)} />
          ))}
          <Chip label="+ Autre fournisseur" onPress={addCustom} />
        </View>
        {error ? (
          <Text
            style={{
              color: theme.danger,
              backgroundColor: theme.surfaceAlt,
              padding: 10,
              borderRadius: 8,
            }}
          >
            {error}
          </Text>
        ) : null}
        <P muted>
          Pour un service personnalise : "Autre fournisseur" puis renseigne l'URL de base (ex.
          https://mon-api.exemple.com/v1), le nom du modele et ta cle.
        </P>
        {profiles.map((p) => (
          <Card key={p.id} style={{ marginBottom: 8 }}>
            <Text style={{ color: theme.text, fontWeight: "700" }}>{p.name}</Text>
            <P muted>
              {p.type} · {p.model} · {p.tokensToday} tokens aujourd'hui
            </P>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Btn title="Modifier" onPress={() => open(p)} style={{ flex: 1 }} />
              <Btn
                title="Supprimer"
                variant="danger"
                onPress={() =>
                  Alert.alert("Supprimer", p.name, [
                    { text: "Annuler", style: "cancel" },
                    {
                      text: "OK",
                      style: "destructive",
                      onPress: async () => {
                        await deleteProfile(p.id);
                        await deleteApiKey(p.id);
                        await load();
                        await refresh();
                        if (edit?.id === p.id) {
                          setEdit(null);
                          setKey("");
                        }
                      },
                    },
                  ])
                }
              />
            </View>
          </Card>
        ))}

        {edit ? (
          <Card>
            <H2>{edit.name}</H2>
            <Field label="Nom affiche" value={edit.name} onChangeText={(t) => setEdit({ ...edit, name: t })} />
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {(["openai", "gemini"] as ProviderType[]).map((t) => (
                <Chip
                  key={t}
                  label={t === "openai" ? "OpenAI-compatible" : "Gemini"}
                  active={edit.type === t}
                  onPress={() => setEdit({ ...edit, type: t })}
                />
              ))}
            </View>
            <Field label="URL de base" value={edit.baseUrl} onChangeText={(t) => setEdit({ ...edit, baseUrl: t })} keyboardType="url" />
            {/8090|nemapi/i.test(edit.name + edit.baseUrl) ? (
              <P muted>
                NemApiBridge : meme telephone = http://127.0.0.1:8090/v1. Autre telephone/PC =
                http://IP_AFFICHEE_DANS_NEMAPIBRIDGE:8090/v1 (pas 127.0.0.1). HTTP autorise.
                Modele = nom du provider (ex. DeepSeek). Rebuild APK requis pour le HTTP local.
              </P>
            ) : null}
            <Field label="Modele" value={edit.model} onChangeText={(t) => setEdit({ ...edit, model: t })} />
            <Field
              label="Cle API"
              value={showKey ? key : maskKey(key) || key}
              onChangeText={setKey}
              secure={!showKey}
              placeholder="sk-... ou AIza..."
            />
            <P muted>
              {key ? "Une cle est enregistree sur cet appareil." : "Aucune cle enregistree."}
            </P>
            <Btn title={showKey ? "Masquer la cle" : "Afficher la cle"} variant="ghost" onPress={() => setShowKey((s) => !s)} />
            <Btn
              title="Supprimer la cle"
              variant="danger"
              disabled={!key}
              onPress={async () => {
                if (!edit) return;
                await deleteApiKey(edit.id);
                setKey("");
                setShowKey(false);
                await load();
                setInfo("Cle supprimee de cet appareil.");
              }}
            />
            <Field
              label="Contexte max (tokens)"
              value={String(edit.maxContext)}
              onChangeText={(t) => setEdit({ ...edit, maxContext: Number(t) || 0 })}
              keyboardType="numeric"
            />
            <RowSwitch
              label="Vision"
              value={edit.supportsVision}
              onValueChange={(v) => setEdit({ ...edit, supportsVision: v })}
            />
            <RowSwitch
              label="PDF natif"
              value={edit.supportsNativePdf}
              onValueChange={(v) => setEdit({ ...edit, supportsNativePdf: v })}
            />
            <P muted>Role</P>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {(["default", "documents", "schemas"] as ProviderRole[]).map((r) => (
                <Chip
                  key={r}
                  label={r}
                  active={edit.role === r}
                  onPress={async () => {
                    setEdit({ ...edit, role: r });
                    const patch =
                      r === "documents"
                        ? { documentsProviderId: edit.id }
                        : r === "schemas"
                          ? { schemasProviderId: edit.id }
                          : { defaultProviderId: edit.id };
                    await setSettings({ ...settings, ...patch });
                  }}
                />
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Btn title="Tester la connexion" onPress={test} loading={testing} style={{ flex: 1 }} />
              <Btn title="Enregistrer" variant="accent" onPress={save} style={{ flex: 1 }} />
            </View>
            {info ? (
              <Text style={{ color: theme.success, marginTop: 10 }}>{info}</Text>
            ) : null}
            {error ? (
              <Text style={{ color: theme.danger, marginTop: 10 }}>{error}</Text>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `Delai depasse (${ms / 1000}s). Verifie l'URL, le reseau et que le fournisseur repond.`
          )
        ),
      ms
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

function RowSwitch({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const theme = useAppStore((s) => s.theme);
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 48 }}>
      <Text style={{ color: theme.text }}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}
