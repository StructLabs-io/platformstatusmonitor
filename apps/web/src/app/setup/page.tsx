"use client";

import { useEffect, useState } from "react";
import { getValidation, type ValidationResult } from "../../lib/api";

export default function SetupPage() {
  const [validation, setValidation] = useState<ValidationResult>({ valid: false, issues: ["Loading"] });

  useEffect(() => {
    void getValidation().then(setValidation);
  }, []);

  return (
    <>
      <h2>Agent Setup</h2>
      <div className="stack">
        <section className="panel">
          <h3>Validation</h3>
          <p className={validation.valid ? "ok" : "bad"}>{validation.valid ? "Config valid" : "Config needs attention"}</p>
          <ul>
            {validation.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h3>Agent Prompt</h3>
          <pre>{`Configure Platform Status Monitor for my install.
Edit bundled JSON config only.
Do not add real secrets.
Use placeholder secret names.
Run pnpm validate:config.
Explain every routing rule you add.`}</pre>
        </section>
      </div>
    </>
  );
}

