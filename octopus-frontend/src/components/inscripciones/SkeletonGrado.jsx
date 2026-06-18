import React from 'react';

export const SkeletonGrado = () => (
    <div
        className="p-5 rounded-2xl animate-pulse"
        style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
    >
        <div className="h-4 w-2/3 rounded-lg mb-3" style={{ background: 'var(--border-md)' }} />
        <div className="h-2 w-full rounded-full" style={{ background: 'var(--border-md)' }} />
    </div>
);
