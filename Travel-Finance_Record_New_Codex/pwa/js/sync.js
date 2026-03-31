export function createSyncController(updateSyncText) {
  return {
    setIdle() {
      updateSyncText('Idle');
    },
    setSyncing() {
      updateSyncText('Syncing');
    },
    setOffline() {
      updateSyncText('Offline cache');
    },
    setError() {
      updateSyncText('Sync failed');
    },
  };
}