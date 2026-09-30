import React from 'react';
import ZonesIconRaw from '../lib/symbols/Zones.svg?raw';
import brushCleaningSvgRaw from '../lib/symbols/brush-cleaning.svg?raw';

// Icons drawn from SVG files in lib/symbols (not available in lucide-react)

export const ZonesIcon: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...props }) => (
    <div
        className={`w-4 h-4 flex items-center justify-center zones-icon-container ${className}`}
        dangerouslySetInnerHTML={{ __html: ZonesIconRaw }}
        {...props}
    />
);

export const BrushCleaningIcon: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...props }) => (
    <div
        className={`w-4 h-4 flex items-center justify-center brush-cleaning-icon-container ${className}`}
        dangerouslySetInnerHTML={{ __html: brushCleaningSvgRaw }}
        {...props}
    />
);
