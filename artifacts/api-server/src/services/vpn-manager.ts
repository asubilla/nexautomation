/**
 * VPN Manager for TikTok UK uploads
 *
 * Strategy (in priority order):
 * 1. ProtonVPN WireGuard config (Windows netsh / wg)
 * 2. ProtonVPN app CLI (if installed)
 * 3. OpenVPN config
 * 4. No VPN fallback (geolocation spoof only via Playwright)
 */

import { execFile, exec } from "child_process";
import { promisify } from "util";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import os from "os";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const VPN_CONFIG_DIR = path.join(os.tmpdir(), "nex-vpn");
if (!existsSync(VPN_CONFIG_DIR)) {
  mkdirSync(VPN_CONFIG_DIR, { recursive: true });
}

let _vpnConnected = false;
let _vpnMethod: string | null = null;

// ─── Load VPN config from DB settings ────────────────────────────────────────

async function getVpnConfig(): Promise<{ type: string; config: string } | null> {
  try {
    const [typeRow] = await db.select().from(settingsTable).where(eq(settingsTable.key, "vpn_type"));
    const [configRow] = await db.select().from(settingsTable).where(eq(settingsTable.key, "vpn_config"));
    if (typeRow?.value && configRow?.value) {
      return { type: typeRow.value, config: configRow.value };
    }
  } catch {}
  return null;
}

// ─── Check current IP ────────────────────────────────────────────────────────

export async function checkCurrentIp(): Promise<{ ip: string; country: string } | null> {
  try {
    const res = await fetch("https://ipinfo.io/json", { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json() as any;
      return { ip: data.ip, country: data.country };
    }
  } catch {}
  return null;
}

// ─── WireGuard via Windows netsh / wg ────────────────────────────────────────

async function connectWireGuard(wgConfig: string): Promise<boolean> {
  try {
    const configPath = path.join(VPN_CONFIG_DIR, "proton-uk.conf");
    writeFileSync(configPath, wgConfig);

    // Try wg-quick (if WireGuard installed)
    const wgQuickPath = "C:\\Program Files\\WireGuard\\wireguard.exe";
    if (existsSync(wgQuickPath)) {
      await execAsync(`"${wgQuickPath}" /installtunnelservice "${configPath}"`);
      await new Promise(r => setTimeout(r, 3000));
      _vpnConnected = true;
      _vpnMethod = "wireguard";
      logger.info("VPN: WireGuard tunnel connected");
      return true;
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, "WireGuard connect failed");
  }
  return false;
}

async function disconnectWireGuard(): Promise<void> {
  try {
    const configPath = path.join(VPN_CONFIG_DIR, "proton-uk.conf");
    const wgQuickPath = "C:\\Program Files\\WireGuard\\wireguard.exe";
    if (existsSync(wgQuickPath)) {
      await execAsync(`"${wgQuickPath}" /uninstalltunnelservice proton-uk`);
      logger.info("VPN: WireGuard tunnel disconnected");
    }
  } catch {}
}

// ─── ProtonVPN App CLI (Windows app has CLI since v2.0) ──────────────────────

async function connectProtonVpnApp(): Promise<boolean> {
  const appPaths = [
    "C:\\Program Files\\Proton\\VPN\\ProtonVPN.exe",
    "C:\\Program Files (x86)\\Proton\\VPN\\ProtonVPN.exe",
  ];

  for (const appPath of appPaths) {
    if (existsSync(appPath)) {
      try {
        // ProtonVPN app CLI: connect to fastest UK server
        await execAsync(`"${appPath}" --connect UK`);
        await new Promise(r => setTimeout(r, 8000));
        _vpnConnected = true;
        _vpnMethod = "protonvpn-app";
        logger.info("VPN: ProtonVPN app connected to UK");
        return true;
      } catch (err: any) {
        logger.warn({ err: err.message }, "ProtonVPN app CLI failed");
      }
    }
  }
  return false;
}

async function disconnectProtonVpnApp(): Promise<void> {
  const appPaths = [
    "C:\\Program Files\\Proton\\VPN\\ProtonVPN.exe",
    "C:\\Program Files (x86)\\Proton\\VPN\\ProtonVPN.exe",
  ];
  for (const appPath of appPaths) {
    if (existsSync(appPath)) {
      try {
        await execAsync(`"${appPath}" --disconnect`);
      } catch {}
    }
  }
}

// ─── OpenVPN ─────────────────────────────────────────────────────────────────

async function connectOpenVpn(ovpnConfig: string): Promise<boolean> {
  const openVpnPaths = [
    "C:\\Program Files\\OpenVPN\\bin\\openvpn.exe",
    "C:\\Program Files (x86)\\OpenVPN\\bin\\openvpn.exe",
  ];

  for (const ovpnPath of openVpnPaths) {
    if (existsSync(ovpnPath)) {
      try {
        const configPath = path.join(VPN_CONFIG_DIR, "proton-uk.ovpn");
        writeFileSync(configPath, ovpnConfig);
        // Run OpenVPN in background
        exec(`"${ovpnPath}" --config "${configPath}" --daemon`);
        await new Promise(r => setTimeout(r, 8000));
        _vpnConnected = true;
        _vpnMethod = "openvpn";
        logger.info("VPN: OpenVPN connected");
        return true;
      } catch (err: any) {
        logger.warn({ err: err.message }, "OpenVPN connect failed");
      }
    }
  }
  return false;
}

async function disconnectOpenVpn(): Promise<void> {
  try {
    await execAsync("taskkill /F /IM openvpn.exe 2>nul");
  } catch {}
}

// ─── Main connect/disconnect ──────────────────────────────────────────────────

export async function connectVpnForTikTok(): Promise<boolean> {
  if (_vpnConnected) {
    logger.info("VPN: already connected");
    return true;
  }

  const vpnConfig = await getVpnConfig();

  if (vpnConfig) {
    logger.info({ type: vpnConfig.type }, "VPN: attempting connection");

    if (vpnConfig.type === "wireguard") {
      const ok = await connectWireGuard(vpnConfig.config);
      if (ok) return true;
    }

    if (vpnConfig.type === "openvpn") {
      const ok = await connectOpenVpn(vpnConfig.config);
      if (ok) return true;
    }
  }

  // Try ProtonVPN app (if installed)
  const ok = await connectProtonVpnApp();
  if (ok) return true;

  // Check current IP anyway
  const ipInfo = await checkCurrentIp();
  if (ipInfo) {
    logger.warn({ ip: ipInfo.ip, country: ipInfo.country }, "VPN: no VPN connected — using direct connection with geolocation spoof only");
  }

  return false;
}

export async function disconnectVpnAfterTikTok(): Promise<void> {
  if (!_vpnConnected) return;

  try {
    if (_vpnMethod === "wireguard") await disconnectWireGuard();
    if (_vpnMethod === "protonvpn-app") await disconnectProtonVpnApp();
    if (_vpnMethod === "openvpn") await disconnectOpenVpn();
  } finally {
    _vpnConnected = false;
    _vpnMethod = null;
    logger.info("VPN: disconnected");
  }
}

export function isVpnConnected(): boolean {
  return _vpnConnected;
}
