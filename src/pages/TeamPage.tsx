import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Copy, Check, Download, Upload, Cloud, HardDrive, Users } from "lucide-react";
import { useApp, isCloud } from "../state/app";
import { useT } from "../i18n";
import { storage, Member, Workspace } from "../storage";

export default function TeamPage() {
  const t = useT();
  const { session, ws, replaceWorkspace, notify } = useApp();
  const [members, setMembers] = useState<Member[]>([]);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session) storage.members(session.team.id).then(setMembers).catch(() => setMembers([]));
  }, [session]);

  if (!session || !ws) return null;
  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="stack" style={{ gap: 18 }}>
        <div>
          <div className="eyebrow"><Users size={15} /> {t("team.title")}</div>
          <h1 style={{ fontSize: "clamp(1.7rem,3vw,2.4rem)" }}>{session.team.name}</h1>
        </div>
        <div className="card">
          <h3>{t("team.joinCode")}</h3>
          <div className="row wrap">
            <span className="mono" style={{ fontSize: "2rem", letterSpacing: "0.3em", fontWeight: 600 }}>{session.team.joinCode}</span>
            <button
              className="btn sm"
              onClick={async () => {
                await navigator.clipboard.writeText(session.team.joinCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? t("common.copied") : t("common.copy")}
            </button>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>{t("team.joinCodeHint")}</p>
        </div>
        <div className="card">
          <h3>{t("team.members")}</h3>
          <table className="data">
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.firstName} {m.lastName}</td>
                  <td className="muted">{m.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>{t("team.backup")}</h3>
          <div className="banner small" style={{ marginBottom: 12 }}>
            {isCloud ? <Cloud size={16} /> : <HardDrive size={16} />} {isCloud ? t("team.storageCloud") : t("team.storageLocal")}
          </div>
          <div className="row wrap">
            <button
              className="btn"
              onClick={() => {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(new Blob([JSON.stringify(ws, null, 2)], { type: "application/json" }));
                a.download = `${session.team.name.replace(/[^\w\-]+/g, "_")}-workspace.json`;
                a.click();
              }}
            >
              <Download size={16} /> {t("team.export")}
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={16} /> {t("team.import")}</button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  const data = JSON.parse(await f.text()) as Workspace;
                  if (data?.version !== 1 || !data.files || !data.programs) throw new Error("bad");
                  if (confirm(t("team.importConfirm"))) replaceWorkspace(data);
                } catch {
                  notify(t("team.importBad"));
                }
              }}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
