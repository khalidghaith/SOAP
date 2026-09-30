import { notify } from '../components/Notifications';

/** Downloads a blob as a file, straight to the Downloads folder. */
export const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Revoking immediately can cancel the download in some browsers
    setTimeout(() => URL.revokeObjectURL(url), 10000);
};

/** Saves with the browser's save dialog where available, otherwise as a regular download. */
export const saveFile = async (blob: Blob, suggestedName: string, extension: string) => {
    const fileName = `${suggestedName}.${extension}`;
    if ('showSaveFilePicker' in window) {
        try {
            const handle = await (window as any).showSaveFilePicker({
                suggestedName: fileName,
                types: [{
                    description: 'File',
                    accept: { [blob.type]: [`.${extension}`] },
                }],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return;
        } catch (err: any) {
            if (err?.name === 'AbortError') return; // user cancelled the dialog
            // Some contexts (embedded browsers, iframes, restricted policies) expose the picker
            // but refuse to write. Fall back to a regular download instead of failing.
            console.warn('Save dialog unavailable, falling back to download:', err);
        }
    }
    try {
        downloadBlob(blob, fileName);
        notify({ kind: 'success', title: `Saved ${fileName}`, message: 'Check your Downloads folder.' });
    } catch (err: any) {
        console.error('Failed to save file:', err);
        notify({ kind: 'error', title: "Couldn't save the file", message: err?.message });
    }
};
