import os
import sys
import time
import requests
import cv2
import numpy as np

BASE_URL = "http://127.0.0.1:8000"


def generate_test_video(filepath: str, duration_sec: int = 4, fps: int = 25):
    """Create a short synthetic exam video with moving targets to test the pipeline."""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    width, height = 640, 480
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(filepath, fourcc, fps, (width, height))

    total_frames = duration_sec * fps
    for i in range(total_frames):
        # Create dark classroom backdrop
        frame = np.full((height, width, 3), 30, dtype=np.uint8)

        # Draw desk
        cv2.rectangle(frame, (100, 320), (540, 460), (70, 70, 80), -1)

        # Simulated candidate head and torso
        cv2.circle(frame, (320, 200), 50, (180, 150, 140), -1)
        cv2.rectangle(frame, (250, 250), (390, 420), (120, 80, 60), -1)

        # Text banner
        cv2.putText(frame, f"TEST EXAM FOOTAGE // SEC {i/fps:.1f}", (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 180), 1)

        out.write(frame)

    out.release()
    print(f"[+] Synthetic test video generated at {filepath} ({total_frames} frames, {duration_sec}s)")


def login(username, password):
    res = requests.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200, f"Login failed: {res.text}"
    return res.json()["access_token"]


def run_tests():
    print("\n" + "="*70)
    print("PHASE 6: VIDEO FORENSIC AUDIT - END-TO-END VERIFICATION")
    print("="*70)

    # 1. Test RBAC: Proctor cannot upload or manage video audits
    print("\n[*] Step 1: Testing RBAC Restrictions...")
    proctor_token = login("proctor1", "Proctor@12345")
    proctor_headers = {"Authorization": f"Bearer {proctor_token}"}

    test_video_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scratch", "test_video.mp4")
    generate_test_video(test_video_path, duration_sec=3, fps=25)

    with open(test_video_path, "rb") as f:
        proctor_upload = requests.post(
            f"{BASE_URL}/api/v1/video-audit/upload",
            headers=proctor_headers,
            files={"video_file": ("test_video.mp4", f, "video/mp4")},
            data={"title": "Proctor Unauthorized Attempt", "sample_fps": "2"}
        )
    print(f"    Proctor upload response: HTTP {proctor_upload.status_code}")
    assert proctor_upload.status_code == 403, f"Expected 403 for proctor, got {proctor_upload.status_code}"
    print("    [PASS] Proctor upload strictly rejected with 403 Forbidden!")

    # 2. Test Admin Upload
    print("\n[*] Step 2: Testing Admin Upload & Audit Launch...")
    admin_token = login("admin", "Admin@12345")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    with open(test_video_path, "rb") as f:
        admin_upload = requests.post(
            f"{BASE_URL}/api/v1/video-audit/upload",
            headers=admin_headers,
            files={"video_file": ("test_video.mp4", f, "video/mp4")},
            data={"title": "Automated Unit Test Recording", "sample_fps": "2"}
        )
    print(f"    Admin upload response: HTTP {admin_upload.status_code}")
    assert admin_upload.status_code == 201, f"Expected 201, got {admin_upload.status_code}: {admin_upload.text}"
    audit_data = admin_upload.json()
    audit_id = audit_data["audit_id"]
    print(f"    [PASS] Audit created successfully: ID={audit_id}, status={audit_data['status']}")

    # 3. Poll for processing completion
    print("\n[*] Step 3: Monitoring Asynchronous Video Processing...")
    completed = False
    for attempt in range(25):
        time.sleep(1)
        detail_res = requests.get(f"{BASE_URL}/api/v1/video-audit/{audit_id}", headers=admin_headers)
        assert detail_res.status_code == 200, f"Detail check failed: {detail_res.text}"
        detail = detail_res.json()
        print(f"    Poll {attempt+1}/25: Status={detail['status']}, Progress={detail['progress_percent']}%, Frames={detail['processed_frames']}/{detail['total_frames']}")
        if detail["status"] == "COMPLETED":
            completed = True
            break
        elif detail["status"] == "FAILED":
            raise RuntimeError(f"Audit processing failed: {detail.get('error_message')}")

    assert completed, "Audit processing timed out"
    print(f"    [PASS] Audit processing completed! Risk score: {detail['risk_score']}")

    # 4. Test HTTP Byte-Range Video Streaming (HTML5 player seeks)
    print("\n[*] Step 4: Testing HTTP Byte-Range Partial Content Video Streaming...")
    stream_res = requests.get(
        f"{BASE_URL}/api/v1/video-audit/{audit_id}/stream",
        headers={"Range": "bytes=0-1024"}
    )
    print(f"    Range request response: HTTP {stream_res.status_code}")
    assert stream_res.status_code == 206, f"Expected 206 Partial Content, got {stream_res.status_code}"
    assert "Content-Range" in stream_res.headers, "Missing Content-Range header"
    assert len(stream_res.content) == 1025, f"Expected 1025 bytes, got {len(stream_res.content)}"
    print(f"    [PASS] Video streaming returned 206 Partial Content: {stream_res.headers.get('Content-Range')}")

    # 5. Test PDF Dossier Synthesis
    print("\n[*] Step 5: Testing ReportLab PDF Forensic Dossier Download...")
    pdf_res = requests.get(f"{BASE_URL}/api/v1/video-audit/{audit_id}/report", headers=admin_headers)
    print(f"    PDF report response: HTTP {pdf_res.status_code}")
    assert pdf_res.status_code == 200, f"Expected 200, got {pdf_res.status_code}"
    assert pdf_res.content.startswith(b"%PDF-"), "Response is not valid PDF binary"
    print(f"    [PASS] Forensic PDF generated successfully! ({len(pdf_res.content)} bytes)")

    # 6. Test Admin Delete
    print("\n[*] Step 6: Testing Admin Audit Deletion...")
    del_res = requests.delete(f"{BASE_URL}/api/v1/video-audit/{audit_id}", headers=admin_headers)
    print(f"    Delete response: HTTP {del_res.status_code}")
    assert del_res.status_code == 200, f"Expected 200, got {del_res.status_code}"

    # Verify deleted
    verify_del = requests.get(f"{BASE_URL}/api/v1/video-audit/{audit_id}", headers=admin_headers)
    assert verify_del.status_code == 404, "Audit was not deleted"
    print("    [PASS] Audit record and associated files cleanly deleted!")

    # Clean up scratch test video
    if os.path.exists(test_video_path):
        os.remove(test_video_path)

    print("\n" + "="*70)
    print("ALL PHASE 6 FORENSIC VIDEO AUDIT TESTS PASSED SUCCESSFULLY! (6/6)")
    print("="*70 + "\n")


if __name__ == "__main__":
    run_tests()
