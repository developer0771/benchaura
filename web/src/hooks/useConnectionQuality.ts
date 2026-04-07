// web/src/hooks/useConnectionQuality.ts
// Monitors WebRTC connection quality using RTCPeerConnection.getStats().
// Polls every 3 seconds and reports: good / degraded / poor / failed.
//
// Metrics used:
//   - packetLossRate: lost / (sent + lost)
//   - roundTripTime: RTT from STUN binding responses
//   - availableOutgoingBitrate: encoder target bitrate

'use client';
import { useState, useEffect, useRef } from 'react';

export type ConnectionQuality = 'unknown' | 'good' | 'degraded' | 'poor' | 'failed';

interface QualityStats {
  quality: ConnectionQuality;
  rtt: number | null;
  packetLoss: number | null;
  bitrate: number | null;
}

const POLL_INTERVAL_MS = 3000;

export function useConnectionQuality(
  peerConnections: Map<string, RTCPeerConnection>
): QualityStats {
  const [stats, setStats] = useState<QualityStats>({
    quality: 'unknown',
    rtt: null,
    packetLoss: null,
    bitrate: null,
  });

  const prevBytesRef = useRef<Map<string, number>>(new Map());
  const prevTimestampRef = useRef<number>(Date.now());

  useEffect(() => {
    if (peerConnections.size === 0) return;

    const poll = async () => {
      const allRtts: number[] = [];
      const allLossRates: number[] = [];
      let totalBitrate = 0;

      for (const [id, pc] of peerConnections) {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') continue;

        try {
          const report = await pc.getStats();
          const now = Date.now();
          const elapsed = (now - prevTimestampRef.current) / 1000;

          report.forEach((s) => {
            // Candidate pair stats → RTT
            if (s.type === 'candidate-pair' && s.state === 'succeeded') {
              if (s.currentRoundTripTime != null) {
                allRtts.push(s.currentRoundTripTime * 1000); // convert to ms
              }
            }

            // Outbound RTP stats → packet loss
            if (s.type === 'outbound-rtp' && s.kind === 'video') {
              const prevBytes = prevBytesRef.current.get(id) ?? 0;
              const bytesSent = s.bytesSent ?? 0;
              const byteDiff = bytesSent - prevBytes;
              if (elapsed > 0) totalBitrate += (byteDiff * 8) / elapsed / 1000; // kbps
              prevBytesRef.current.set(id, bytesSent);
            }

            // Remote inbound RTP → packet loss rate
            if (s.type === 'remote-inbound-rtp') {
              const lost = s.packetsLost ?? 0;
              const received = s.packetsReceived ?? 0;
              const total = lost + received;
              if (total > 0) allLossRates.push(lost / total);
            }
          });

          prevTimestampRef.current = now;
        } catch {
          // getStats can fail on disconnected peers — ignore
        }
      }

      const avgRtt      = allRtts.length > 0 ? allRtts.reduce((a, b) => a + b) / allRtts.length : null;
      const avgLossRate = allLossRates.length > 0 ? allLossRates.reduce((a, b) => a + b) / allLossRates.length : null;

      // Determine quality tier
      let quality: ConnectionQuality = 'good';
      if (avgRtt !== null && avgRtt > 400) quality = 'poor';
      else if (avgRtt !== null && avgRtt > 200) quality = 'degraded';
      if (avgLossRate !== null && avgLossRate > 0.1) quality = 'poor';
      else if (avgLossRate !== null && avgLossRate > 0.03 && quality === 'good') quality = 'degraded';

      setStats({
        quality,
        rtt:        avgRtt != null ? Math.round(avgRtt) : null,
        packetLoss: avgLossRate != null ? Math.round(avgLossRate * 100) : null,
        bitrate:    Math.round(totalBitrate),
      });
    };

    const timer = setInterval(poll, POLL_INTERVAL_MS);
    poll(); // immediate first poll
    return () => clearInterval(timer);
  }, [peerConnections]);

  return stats;
}
