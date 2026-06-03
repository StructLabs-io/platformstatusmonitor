"use client";

import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
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
        <Card className="panel">
          <CardHeader>
            <CardTitle>Validation</CardTitle>
            <CardDescription>
              <Badge variant={validation.valid ? "secondary" : "destructive"}>
                {validation.valid ? "Config valid" : "Config needs attention"}
              </Badge>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul>
              {validation.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="panel">
          <CardHeader>
            <CardTitle>Agent Prompt</CardTitle>
          </CardHeader>
          <CardContent>
          <pre>{`Configure Platform Status Monitor for my install.
Edit bundled JSON config only.
Do not add real secrets.
Use placeholder secret names.
Run pnpm validate:config.
Explain every routing rule you add.`}</pre>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
