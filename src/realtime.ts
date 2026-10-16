import { io, type Socket } from 'socket.io-client';
import type { QueryClient } from '@tanstack/react-query';
import { getAccessToken } from './api';
import type { Simulation } from './types';

let socket: Socket | null = null;
export function connectRealtime(queryClient: QueryClient) {
  socket?.disconnect();
  socket = io('/', { auth: (callback) => callback({ token: getAccessToken() }), reconnection: true });
  const invalidateRuns = () => {
    void queryClient.invalidateQueries({ queryKey: ['simulations'] });
    void queryClient.invalidateQueries({ queryKey: ['alphas'] });
  };
  const patchRun = (id: string, patch: Partial<Simulation>) => {
    queryClient.setQueryData<Simulation>(['simulation', id], (previous) => previous ? { ...previous, ...patch } : previous);
    void queryClient.invalidateQueries({ queryKey: ['simulation', id] });
    invalidateRuns();
  };
  socket.on('simulation.queued', ({ id, runNumber }: { id: string; runNumber: number }) => patchRun(id, { id, runNumber, status: 'queued' } as Simulation));
  socket.on('simulation.running', ({ id }: { id: string }) => patchRun(id, { status: 'running' }));
  socket.on('simulation.progress', ({ id, status }: { id: string; status?: string }) => { if (status === 'retrying') patchRun(id, { status: 'queued' }); });
  socket.on('simulation.failed', ({ id, error }: { id: string; error: Simulation['error'] }) => patchRun(id, { status: 'failed', error }));
  socket.on('simulation.cancelled', ({ id }: { id: string }) => patchRun(id, { status: 'cancelled' }));
  socket.on('simulation.completed', ({ id }: { id: string }) => patchRun(id, { status: 'completed' }));
  socket.on('brain.expired', () => { void queryClient.invalidateQueries({ queryKey: ['brain', 'status'] }); });
  socket.on('brain.connected', () => { void queryClient.invalidateQueries({ queryKey: ['brain', 'status'] }); });
  socket.on('brain.verification_timeout', () => { void queryClient.invalidateQueries({ queryKey: ['brain', 'status'] }); });
  socket.on('experiment.progress', ({ id }: { id: string }) => { void queryClient.invalidateQueries({ queryKey: ['experiment', id] }); });
  socket.on('connect', invalidateRuns);
  return socket;
}
export function disconnectRealtime() { socket?.disconnect(); socket = null; }
