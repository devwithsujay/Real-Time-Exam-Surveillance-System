import os
import json
from io import BytesIO
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Image, KeepTogether, Spacer

_SEV_COLORS = {
    "CRITICAL": colors.HexColor("#dc2626"),
    "HIGH": colors.HexColor("#b91c1c"),
    "MEDIUM": colors.HexColor("#b45309"),
    "LOW": colors.HexColor("#15803d"),
}


def _styled_table(data, col_widths):
    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f8fafc"), colors.white]),
    ]))
    return table


def generate_video_audit_pdf(audit, incidents, base_dir: str) -> bytes:
    """Generate a forensic PDF dossier for a completed video audit."""
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=15 * mm, bottomMargin=15 * mm)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "AuditTitle", parent=styles["Title"], fontSize=18, leading=22, spaceAfter=2, textColor=colors.HexColor("#0f172a")
    )
    subtitle_style = ParagraphStyle(
        "AuditSubtitle", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#64748b"), spaceAfter=14
    )
    section_style = ParagraphStyle(
        "AuditSection", parent=styles["Heading2"], fontSize=12, leading=16, spaceBefore=12, spaceAfter=6, textColor=colors.HexColor("#1e293b")
    )
    caption_style = ParagraphStyle(
        "AuditCaption", parent=styles["Normal"], fontSize=8.5, leading=11, spaceAfter=2
    )

    elements = [
        Paragraph("ARGUS // Video Forensic Audit Dossier", title_style),
        Paragraph(f"Autonomous Pre-Recorded Exam Examination & Integrity Verification · Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}", subtitle_style),
        Spacer(1, 2 * mm),
        Paragraph("1. Audit Overview & Parameters", section_style),
    ]

    dur_min = int(audit.duration_seconds // 60)
    dur_sec = int(audit.duration_seconds % 60)
    dur_str = f"{dur_min}m {dur_sec}s ({audit.duration_seconds:.1f}s)"

    overview_data = [
        ["Audit Identifier", str(audit.audit_id)],
        ["Session / Title", audit.title or "Pre-Recorded Exam Session"],
        ["Source Media File", audit.filename or "-"],
        ["Video Duration", dur_str],
        ["Source Frame Rate", f"{audit.fps:.2f} FPS"],
        ["Total Analyzed Frames", f"{audit.processed_frames} / {audit.total_frames} (Sampled at {audit.sample_fps} FPS)"],
        ["Audit Status", str(getattr(audit.status, "value", audit.status))],
        ["Aggregated Risk Score", f"{audit.risk_score:.1f} / 100.0"],
        ["Total Infractions Detected", str(len(incidents))],
    ]
    elements.append(_styled_table(overview_data, [55 * mm, 119 * mm]))

    # Severity distribution
    sev_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for inc in incidents:
        s = getattr(inc.severity, "value", str(inc.severity))
        if s in sev_counts:
            sev_counts[s] += 1

    elements.append(Paragraph("2. Threat & Infraction Breakdown", section_style))
    sev_data = [
        ["Severity Level", "Flags Detected", "Threat Contribution", "Recommended Action"],
        ["CRITICAL", str(sev_counts["CRITICAL"]), "Direct Exam Invalidation Risk", "Immediate Human Review Required"],
        ["HIGH", str(sev_counts["HIGH"]), "Cell Phone / Unauthorized Device", "Secondary Auditor Confirmation"],
        ["MEDIUM", str(sev_counts["MEDIUM"]), "Collaboration / Communication", "Log for Invigilator Review"],
        ["LOW", str(sev_counts["LOW"]), "Gaze Departure / Minor Posture Shift", "Heuristic Behavioral Note"],
    ]
    elements.append(_styled_table(sev_data, [32 * mm, 30 * mm, 56 * mm, 56 * mm]))

    elements.append(Paragraph("3. Chronological Infraction Log", section_style))
    if incidents:
        inc_rows = [["Timecode", "Frame", "Infraction Type", "Severity", "Confidence", "Description"]]
        for inc in incidents[:50]:  # Limit to 50 rows in summary table
            t_sec = inc.timestamp_seconds
            tc = f"{int(t_sec // 60):02d}:{int(t_sec % 60):02d}"
            ev_type = getattr(inc.event_type, "value", str(inc.event_type))
            sev = getattr(inc.severity, "value", str(inc.severity))
            conf = f"{int(inc.confidence * 100)}%" if inc.confidence else "-"
            desc = (inc.description or "")[:45] + ("..." if len(inc.description or "") > 45 else "")
            inc_rows.append([tc, str(inc.frame_index), ev_type, sev, conf, desc])
        elements.append(_styled_table(inc_rows, [20 * mm, 18 * mm, 45 * mm, 22 * mm, 20 * mm, 49 * mm]))
    else:
        elements.append(Paragraph("No behavioral infractions or unauthorized items were detected during this audit.", styles["Normal"]))

    # Evidence Snapshots Grid
    elements.append(Paragraph("4. Keyframe Forensic Snapshots", section_style))
    valid_snapshots = []
    for inc in incidents:
        if inc.snapshot_path:
            full_path = os.path.join(base_dir, inc.snapshot_path.replace("/", os.sep))
            if os.path.isfile(full_path):
                valid_snapshots.append((inc, full_path))

    if valid_snapshots:
        # Show top snapshots up to 10
        for inc, snap_file in valid_snapshots[:10]:
            try:
                img = Image(snap_file, width=120 * mm, height=67.5 * mm)
                t_sec = inc.timestamp_seconds
                tc = f"{int(t_sec // 60):02d}:{int(t_sec % 60):02d}"
                sev = getattr(inc.severity, "value", str(inc.severity))
                sev_col = _SEV_COLORS.get(sev, colors.black).hexval()[2:]

                vlm_clause = ""
                if getattr(inc, "vlm_verified", False) and getattr(inc, "vlm_analysis", None):
                    try:
                        vdata = json.loads(inc.vlm_analysis)
                        v_desc = vdata.get("description", "")
                        v_conf = int(vdata.get("confidence", 0) * 100)
                        v_model = vdata.get("model", "VLM")
                        vlm_clause = f"<br/><font color='#0071e3'><b>VLM AI Assessment ({v_model}):</b></font> {v_desc} <i>({v_conf}% confidence)</i>"
                    except Exception:
                        pass

                caption = Paragraph(
                    f"<b>TIMECODE {tc}</b> (Frame {inc.frame_index}) &nbsp;|&nbsp; "
                    f"<b>{getattr(inc.event_type, 'value', str(inc.event_type))}</b> &nbsp;|&nbsp; "
                    f"<font color='#{sev_col}'><b>{sev}</b></font> &nbsp;|&nbsp; "
                    f"<i>{inc.description or ''}</i>{vlm_clause}",
                    caption_style
                )
                elements.append(KeepTogether([img, Spacer(1, 1 * mm), caption, Spacer(1, 4 * mm)]))
            except Exception as e:
                elements.append(Paragraph(f"[Snapshot error: {e}]", styles["Normal"]))
    else:
        elements.append(Paragraph("No evidentiary keyframe snapshots captured.", styles["Normal"]))

    doc.build(elements)
    buf.seek(0)
    return buf.getvalue()
