import React from 'react';

export const SkeletonCard = () => (
    <div
        className="p-6 rounded-2xl animate-pulse"
        style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
    >
        <div className="h-4 w-3/4 rounded-lg mb-2" style={{ background: 'var(--border-md)' }} />
        <div className="h-3 w-1/2 rounded-lg mb-4" style={{ background: 'var(--border-md)' }} />
        <div className="h-3 w-1/4 rounded-md" style={{ background: 'var(--border-md)' }} />
    </div>
);
