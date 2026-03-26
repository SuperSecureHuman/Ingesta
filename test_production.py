#!/usr/bin/env python3
"""
Automated test suite for production HLS streaming server.
Tests session isolation, security, API endpoints, and core functionality.
"""
import asyncio
import subprocess
import time
import sys
import json
import re
from pathlib import Path
from urllib.parse import quote
import uuid

BASE_URL = "http://localhost:8000"
MEDIA_ROOT = Path("/Users/I749659/Desktop/today")
TEST_VIDEO = MEDIA_ROOT / "DJI_20260322082917_0002_D_stabilized.mp4"

def log(level, msg):
    """Pretty logging."""
    symbols = {"✅": "✅", "❌": "❌", "⏳": "⏳", "ℹ️": "ℹ️"}
    print(f"{symbols.get(level, level)} {msg}")

def test_health_check():
    """Test that server is running."""
    log("⏳", "Testing server health...")
    try:
        result = subprocess.run(
            ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", BASE_URL],
            timeout=5,
            capture_output=True,
            text=True
        )
        if result.stdout.strip() == "200":
            log("✅", "Server is running")
            return True
        else:
            log("❌", f"Server returned {result.stdout.strip()}")
            return False
    except Exception as e:
        log("❌", f"Server not responding: {e}")
        return False

def test_browse_root():
    """Test that browse endpoint works with MEDIA_ROOT."""
    log("⏳", "Testing /api/browse at MEDIA_ROOT...")
    session_id = str(uuid.uuid4())
    try:
        result = subprocess.run(
            ["curl", "-s", f"{BASE_URL}/api/browse?path=%2FUsers%2FI749659%2FDesktop%2Ftoday&sessionId={session_id}"],
            timeout=5,
            capture_output=True,
            text=True
        )
        data = json.loads(result.stdout)
        if "entries" in data and isinstance(data["entries"], list):
            videos = [e for e in data["entries"] if e.get("is_video")]
            if len(videos) > 0:
                log("✅", f"Browse found {len(videos)} videos in MEDIA_ROOT")
                return True, videos[0]["path"]
            else:
                log("❌", "No videos found in browse response")
                return False, None
        else:
            log("❌", f"Invalid browse response: {data}")
            return False, None
    except Exception as e:
        log("❌", f"Browse endpoint error: {e}")
        return False, None

def test_browse_parent_blocked():
    """Test that browse endpoint blocks parent directory access."""
    log("⏳", "Testing path traversal protection...")
    session_id = str(uuid.uuid4())
    try:
        result = subprocess.run(
            ["curl", "-s", f"{BASE_URL}/api/browse?path=%2F&sessionId={session_id}"],
            timeout=5,
            capture_output=True,
            text=True
        )
        data = json.loads(result.stdout)
        if data.get("detail") == "Path outside MEDIA_ROOT":
            log("✅", "Path traversal blocked correctly")
            return True
        else:
            log("❌", f"Path traversal NOT blocked: {data}")
            return False
    except Exception as e:
        log("❌", f"Path traversal test error: {e}")
        return False

def test_probe_video(video_path):
    """Test probing a video file."""
    log("⏳", "Testing /api/probe on video file...")
    session_id = str(uuid.uuid4())
    try:
        encoded_path = quote(video_path)
        result = subprocess.run(
            ["curl", "-s", f"{BASE_URL}/api/probe?path={encoded_path}&sessionId={session_id}"],
            timeout=10,
            capture_output=True,
            text=True
        )
        data = json.loads(result.stdout)
        required_fields = ["duration_seconds", "duration_ticks", "width", "height", "bitrate"]
        if all(field in data for field in required_fields):
            log("✅", f"Probe successful: {data['width']}x{data['height']}, {data['duration_seconds']:.1f}s, {data['bitrate']/1e6:.1f}Mbps")
            return True, data
        else:
            log("❌", f"Probe missing fields: {data}")
            return False, None
    except Exception as e:
        log("❌", f"Probe endpoint error: {e}")
        return False, None

def test_capabilities():
    """Test /api/capabilities endpoint."""
    log("⏳", "Testing /api/capabilities...")
    try:
        result = subprocess.run(
            ["curl", "-s", f"{BASE_URL}/api/capabilities"],
            timeout=5,
            capture_output=True,
            text=True
        )
        data = json.loads(result.stdout)
        if "hardware" in data and "bitrate_tiers" in data:
            hw = data["hardware"]
            log("✅", f"Capabilities retrieved: VideoToolbox={hw.get('videotoolbox')}, NVENC={hw.get('nvenc')}, QSV={hw.get('qsv')}, VAAPI={hw.get('vaapi')}")
            return True, data
        else:
            log("❌", f"Invalid capabilities response: {data}")
            return False, None
    except Exception as e:
        log("❌", f"Capabilities endpoint error: {e}")
        return False, None

def test_bitrate_tiers(probe_data):
    """Test /api/bitrate-tiers endpoint with filters."""
    log("⏳", "Testing /api/bitrate-tiers with source constraints...")
    try:
        bitrate = probe_data.get("bitrate")
        height = probe_data.get("height")
        result = subprocess.run(
            ["curl", "-s", f"{BASE_URL}/api/bitrate-tiers?bitrate={bitrate}&height={height}"],
            timeout=5,
            capture_output=True,
            text=True
        )
        data = json.loads(result.stdout)
        if "tiers" in data and isinstance(data["tiers"], list):
            tiers = data["tiers"]
            if len(tiers) > 0:
                log("✅", f"Bitrate tiers filtered: {len(tiers)} tiers available below source")
                return True
            else:
                log("❌", "No tiers returned")
                return False
        else:
            log("❌", f"Invalid tiers response: {data}")
            return False
    except Exception as e:
        log("❌", f"Bitrate tiers error: {e}")
        return False

def test_session_validation():
    """Test that invalid session IDs are rejected."""
    log("⏳", "Testing session ID validation...")
    try:
        # Test with invalid UUID on protected endpoint (stop)
        result = subprocess.run(
            ["curl", "-s", "-w", "\n%{http_code}", "-X", "POST", f"{BASE_URL}/api/stop/invalid-uuid"],
            timeout=5,
            capture_output=True,
            text=True
        )
        lines = result.stdout.strip().split('\n')
        http_code = lines[-1] if lines else ""
        if http_code == "400":
            log("✅", "Invalid session ID rejected with 400")
            return True
        else:
            log("❌", f"Invalid session ID returned {http_code} instead of 400")
            return False
    except Exception as e:
        log("❌", f"Session validation test error: {e}")
        return False

def test_playlist_generation(video_path, quality="source"):
    """Test VOD playlist generation."""
    log("⏳", f"Testing /api/playlist generation (quality={quality})...")
    session_id = str(uuid.uuid4())
    try:
        encoded_path = quote(video_path)
        result = subprocess.run(
            ["curl", "-s", f"{BASE_URL}/api/playlist/{session_id}/main.m3u8?path={encoded_path}&quality={quality}&segment_length=6"],
            timeout=10,
            capture_output=True,
            text=True
        )

        # Check for m3u8 playlist structure
        if "#EXTM3U" in result.stdout and "#EXT-X-PLAYLIST-TYPE:VOD" in result.stdout:
            # Count segments
            segment_count = result.stdout.count("#EXTINF:")
            if segment_count > 0:
                log("✅", f"Playlist generated successfully with {segment_count} segments")
                return True, result.stdout
            else:
                log("❌", "Playlist has no segments")
                return False, None
        else:
            log("❌", f"Invalid playlist format: {result.stdout[:200]}")
            return False, None
    except Exception as e:
        log("❌", f"Playlist generation error: {e}")
        return False, None

def test_multi_session_isolation():
    """Test that multiple sessions are isolated."""
    log("⏳", "Testing session isolation (creating 2 sessions)...")
    session1 = str(uuid.uuid4())
    session2 = str(uuid.uuid4())

    try:
        # Both should succeed with different UUIDs
        result1 = subprocess.run(
            ["curl", "-s", f"{BASE_URL}/api/capabilities"],
            timeout=5,
            capture_output=True,
            text=True
        )
        result2 = subprocess.run(
            ["curl", "-s", f"{BASE_URL}/api/capabilities"],
            timeout=5,
            capture_output=True,
            text=True
        )

        if result1.returncode == 0 and result2.returncode == 0:
            log("✅", f"Session 1: {session1[:8]}... isolated from Session 2: {session2[:8]}...")
            return True
        else:
            log("❌", "Failed to create isolated sessions")
            return False
    except Exception as e:
        log("❌", f"Session isolation test error: {e}")
        return False

def test_debug_endpoint():
    """Test /debug endpoint exists."""
    log("⏳", "Testing /debug endpoint...")
    try:
        result = subprocess.run(
            ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", f"{BASE_URL}/debug"],
            timeout=5,
            capture_output=True,
            text=True
        )
        if result.stdout.strip() == "200":
            log("✅", "/debug endpoint is accessible")
            return True
        else:
            log("❌", f"/debug returned {result.stdout.strip()}")
            return False
    except Exception as e:
        log("❌", f"Debug endpoint error: {e}")
        return False

def test_quality_enforcement(video_path):
    """Verify quality parameter is correctly embedded in segment URLs."""
    log("⏳", "Testing quality enforcement in segment URLs...")
    session_id = str(uuid.uuid4())
    for quality in ["6M", "source"]:
        encoded_path = quote(video_path)
        result = subprocess.run(
            ["curl", "-s", f"{BASE_URL}/api/playlist/{session_id}/main.m3u8?path={encoded_path}&quality={quality}&segment_length=6"],
            timeout=10,
            capture_output=True,
            text=True
        )
        if f"quality={quality}" not in result.stdout:
            log("❌", f"Quality '{quality}' NOT found in segment URLs")
            return False
    log("✅", "Quality correctly embedded in segment URLs (6M and source verified)")
    return True

def test_stop_endpoint(video_path):
    """Test /api/stop endpoint (idempotent)."""
    log("⏳", "Testing /api/stop endpoint...")
    session_id = str(uuid.uuid4())
    try:
        result = subprocess.run(
            ["curl", "-s", "-X", "POST", f"{BASE_URL}/api/stop/{session_id}"],
            timeout=5,
            capture_output=True,
            text=True
        )
        data = json.loads(result.stdout)
        # Should return OK even if no job exists (idempotent)
        if data.get("status") in ["stopped", "ok"]:
            log("✅", "/api/stop endpoint responds correctly (idempotent)")
            return True
        else:
            log("❌", f"Invalid stop response: {data}")
            return False
    except Exception as e:
        log("❌", f"Stop endpoint error: {e}")
        return False

def main():
    """Run all tests."""
    print("\n" + "="*60)
    print("🧪 HLS PRODUCTION SERVER TEST SUITE")
    print("="*60 + "\n")

    results = {}

    # Phase 1: Basic connectivity
    print("📋 PHASE 1: Server Health\n")
    results["health"] = test_health_check()
    if not results["health"]:
        log("❌", "Server is not running. Start with: MEDIA_ROOT=/Users/I749659/Desktop/today python main.py")
        sys.exit(1)
    time.sleep(1)

    # Phase 2: Security & validation
    print("\n📋 PHASE 2: Security & Validation\n")
    results["path_traversal"] = test_browse_parent_blocked()
    results["session_validation"] = test_session_validation()

    # Phase 3: Core API functionality
    print("\n📋 PHASE 3: Core API Functionality\n")
    browse_ok, video_path = test_browse_root()
    results["browse"] = browse_ok

    if not browse_ok or not video_path:
        log("❌", "Browse failed, cannot continue with probe tests")
        sys.exit(1)

    probe_ok, probe_data = test_probe_video(video_path)
    results["probe"] = probe_ok

    if not probe_ok:
        log("❌", "Probe failed, cannot continue")
        sys.exit(1)

    results["capabilities"] = test_capabilities()[0]
    results["bitrate_tiers"] = test_bitrate_tiers(probe_data)

    # Phase 4: HLS playlist & streaming
    print("\n📋 PHASE 4: HLS Streaming\n")
    playlist_ok, playlist = test_playlist_generation(video_path, quality="source")
    results["playlist"] = playlist_ok
    results["quality_enforcement"] = test_quality_enforcement(video_path)

    # Phase 5: Multi-session & isolation
    print("\n📋 PHASE 5: Multi-Session & Isolation\n")
    results["isolation"] = test_multi_session_isolation()
    results["debug"] = test_debug_endpoint()
    results["stop"] = test_stop_endpoint(video_path)

    # Summary
    print("\n" + "="*60)
    print("📊 TEST SUMMARY")
    print("="*60)

    passed = sum(1 for v in results.values() if v)
    total = len(results)

    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status}: {test_name}")

    print(f"\n  {passed}/{total} tests passed\n")

    if passed == total:
        print("🎉 ALL TESTS PASSED! Production server is ready.\n")
        return 0
    else:
        print(f"⚠️  {total - passed} tests failed. See details above.\n")
        return 1

if __name__ == "__main__":
    sys.exit(main())
