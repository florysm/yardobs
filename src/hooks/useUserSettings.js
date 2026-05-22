import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../utils/apiFetch';

export function useUserSettings(session) {
  const [settings, setSettings]   = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving]   = useState(false);
  const [error, setError]         = useState(null);
  const generation = useRef(0);

  const loadSettings = useCallback(async () => {
    if (!session) { setSettings(null); return; }
    const gen = ++generation.current;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/api/settings');
      if (gen !== generation.current) return;
      setSettings(data); // null means user has no settings yet
    } catch (err) {
      if (gen !== generation.current) return;
      setError(err.message);
    } finally {
      if (gen === generation.current) setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveSettings = useCallback(async ({ stationId, stationLabel, twcApiKey }) => {
    setIsSaving(true);
    setError(null);
    try {
      const data = await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId, stationLabel, twcApiKey }),
      });
      setSettings(data);
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsSaving(false);
    }
  }, []);

  return { settings, isLoading, isSaving, error, saveSettings, reloadSettings: loadSettings };
}
