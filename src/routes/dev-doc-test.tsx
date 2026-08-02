import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BlobRenderer } from "@/components/doc-render";

export const Route = createFileRoute("/dev-doc-test")({ component: DevDocTest });

function DevDocTest() {
  const [file, setFile] = useState<{ blob: Blob; name: string } | null>(null);
  useEffect(() => {
    (window as any).__loadDoc = (b64: string, name: string) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      setFile({ blob: new Blob([bin]), name });
    };
  }, []);
  return (
    <div id="dev-doc-host" className="min-h-screen bg-surface-muted">
      {file && <BlobRenderer key={file.name} blob={file.blob} fileName={file.name} />}
    </div>
  );
}
