'use client';

interface DocumentEditorLayoutProps {
  title?: string;
  children: React.ReactNode;
  previewContent: React.ReactNode;
  actions?: React.ReactNode;
}

export function DocumentEditorLayout({
  children,
  previewContent,
  actions,
}: DocumentEditorLayoutProps) {
  return (
    <div className="min-h-screen">
      {/* Editor + Preview */}
      <div className="mx-auto max-w-[1600px] px-4 py-4 md:px-6">
        <div className="grid gap-6 lg:grid-cols-[3fr_5fr]">
          {/* Editor Panel */}
          <div className="space-y-5 print-hidden">
            {children}
          </div>

          {/* Preview Panel — A5 proportioned */}
          <div className="flex justify-center print:justify-center" id="document-preview">
            <div className="w-full max-w-[680px] print:max-w-none">
              <div className="sticky top-20">
                <div className="mb-2 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground print:hidden">
                  Pratinjau
                </div>
                {/* A5 container: 148mm x 210mm ratio, scaled for screen */}
                <div className="a5-preview-container mx-auto bg-white" style={{ aspectRatio: '148 / 210' }}>
                  <div className="a5-preview-scaler">
                    {previewContent}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons — below preview */}
        {actions && (
          <div className="mt-6">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
