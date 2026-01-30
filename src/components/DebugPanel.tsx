import { useState, useEffect, useCallback } from 'react';

interface DebugLogEntry {
  timestamp: string;
  level: 'info' | 'error' | 'success';
  message: string;
  data?: unknown;
}

export default function DebugPanel() {
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [isVisible, setIsVisible] = useState(false); // Standardmäßig minimiert

  const addLog = useCallback((level: DebugLogEntry['level'], message: string, data?: unknown) => {
    const entry: DebugLogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      data
    };
    setLogs(prev => [...prev.slice(-20), entry]); // Keep last 20 logs
  }, []);

  // Override console methods
  useEffect(() => {
    const originalLog = console.log;
    const originalError = console.error;

    console.log = (...args: unknown[]) => {
      originalLog(...args);
      addLog('info', args.join(' '), args.length > 1 ? args.slice(1) : undefined);
    };

    console.error = (...args: unknown[]) => {
      originalError(...args);
      addLog('error', args.join(' '), args.length > 1 ? args.slice(1) : undefined);
    };

    return () => {
      console.log = originalLog;
      console.error = originalError;
    };
  }, [addLog]);

  function clearLogs() {
    setLogs([]);
  }

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        style={{
          position: 'fixed',
          bottom: '1rem',
          right: '1rem',
          padding: '0.5rem 1rem',
          backgroundColor: '#1f2937',
          color: 'white',
          border: 'none',
          borderRadius: '0.5rem',
          fontSize: '0.875rem',
          zIndex: 9999,
          boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
        }}
      >
        🐛 Debug
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '50vh', // Größer
        backgroundColor: '#1f2937',
        color: '#f3f4f6',
        borderTop: '2px solid #3b82f6',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'monospace',
        fontSize: '0.75rem'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.5rem',
          backgroundColor: '#111827',
          borderBottom: '1px solid #374151'
        }}
      >
        <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>🐛 Debug Console</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={clearLogs}
            style={{
              padding: '0.25rem 0.5rem',
              backgroundColor: '#374151',
              color: 'white',
              border: 'none',
              borderRadius: '0.25rem',
              fontSize: '0.75rem'
            }}
          >
            Clear
          </button>
          <button
            onClick={() => setIsVisible(false)}
            style={{
              padding: '0.25rem 0.5rem',
              backgroundColor: '#374151',
              color: 'white',
              border: 'none',
              borderRadius: '0.25rem',
              fontSize: '0.75rem'
            }}
          >
            Hide
          </button>
        </div>
      </div>

      {/* Logs */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem'
        }}
      >
        {logs.length === 0 ? (
          <div style={{ color: '#6b7280', textAlign: 'center', padding: '1rem' }}>
            No logs yet...
          </div>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              style={{
                padding: '0.25rem 0.5rem',
                backgroundColor: log.level === 'error' ? '#7f1d1d' : log.level === 'success' ? '#14532d' : '#374151',
                borderRadius: '0.25rem',
                borderLeft: `3px solid ${log.level === 'error' ? '#ef4444' : log.level === 'success' ? '#22c55e' : '#3b82f6'}`
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <span style={{ color: '#9ca3af', minWidth: '4rem' }}>{log.timestamp}</span>
                <span style={{ flex: 1, wordBreak: 'break-word' }}>{log.message}</span>
              </div>
              {log.data != null && (
                <div style={{ marginTop: '0.25rem', marginLeft: '4.5rem', color: '#9ca3af', fontSize: '0.7rem' }}>
                  {JSON.stringify(log.data, null, 2)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
