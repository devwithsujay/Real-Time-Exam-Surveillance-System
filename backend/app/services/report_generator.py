from io import BytesIO
from datetime import datetime
from os.path import isfile

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Image, KeepTogether

_SEV_COLORS = {
    "HIGH": colors.HexColor("#b91c1c"),
    "MEDIUM": colors.HexColor("#b45309"),
    "LOW": colors.HexColor("#15803d"),
}


def _styled_table(data, col_widths):
    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return table


def generate_pdf_report(exam, stats, participants, events) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("Title", parent=styles["Title"], fontSize=16, spaceAfter=4)
    subtitle_style = ParagraphStyle("Subtitle", parent=styles["Normal"], textColor=colors.grey, spaceAfter=12)
    section_style = ParagraphStyle("Section", parent=styles["Heading2"], fontSize=12, spaceBefore=14, spaceAfter=6)
    caption_style = ParagraphStyle("Caption", parent=styles["Normal"], fontSize=9, spaceAfter=2)

    elements = [
        Paragraph("Exam Surveillance Report", title_style),
        Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", subtitle_style),
        Paragraph("Exam Details", section_style),
        _styled_table(
            [
                ["Exam ID", str(exam.exam_id)],
                ["Exam Name", exam.exam_name],
                ["Location", exam.location or "-"],
                ["Duration (min)", exam.duration_minutes or "-"],
                ["Start Time", exam.start_time.isoformat() if exam.start_time else "-"],
                ["End Time", exam.end_time.isoformat() if exam.end_time else "-"],
            ],
            [50 * mm, 120 * mm],
        ),
        Paragraph("Summary", section_style),
        _styled_table(
            [
                ["Total Students", stats.get("total_students", 0)],
                ["Checked In", stats.get("checked_in", 0)],
                ["Total Events", stats.get("total_events", 0)],
                ["High Severity Events", stats.get("high_severity_events", 0)],
                ["Medium Severity Events", stats.get("medium_severity_events", 0)],
                ["Low Severity Events", stats.get("low_severity_events", 0)],
                ["Flagged Students", stats.get("flagged_students_count", 0)],
            ],
            [80 * mm, 90 * mm],
        ),
        Paragraph("Top Violations", section_style),
    ]

    violations = stats.get("top_violations", [])
    if violations:
        elements.append(_styled_table(
            [["Violation Type", "Count", "Percentage"]]
            + [[v.get("type", "-"), v.get("count", 0), f"{v.get('percentage', 0)}%"] for v in violations],
            [90 * mm, 40 * mm, 40 * mm],
        ))
    else:
        elements.append(Paragraph("No violations recorded.", styles["Normal"]))

    elements.append(Paragraph("Participants", section_style))
    if participants:
        rows = [["Roll Number", "Name", "Seat", "Status", "Risk Score"]]
        for p in participants:
            rows.append([
                p.roll_number,
                p.name,
                p.seat_number,
                getattr(p.status, "value", str(p.status)),
                p.risk_score or 0,
            ])
        elements.append(_styled_table(rows, [35 * mm, 55 * mm, 25 * mm, 35 * mm, 20 * mm]))
    else:
        elements.append(Paragraph("No participants registered.", styles["Normal"]))

    elements.append(Paragraph("Incidents (Chronological)", section_style))

    incidents = [e for e in events if getattr(e, "evidence_screenshot_path", None) and isfile(e.evidence_screenshot_path)]
    if incidents:
        for event in incidents:
            try:
                img = Image(event.evidence_screenshot_path, width=110 * mm, height=62 * mm)
            except Exception:
                img = Paragraph("[Screenshot unavailable]", styles["Normal"])
            ts = event.timestamp.strftime("%Y-%m-%d %H:%M:%S") if event.timestamp else "-"
            sev_color = _SEV_COLORS.get(event.severity.value if hasattr(event.severity, "value") else str(event.severity), colors.black)
            caption = Paragraph(
                f"<b>{event.event_type.value if hasattr(event.event_type, 'value') else event.event_type}</b> "
                f"&nbsp;|&nbsp; <font color='#{sev_color.hexval()[2:]}'><b>{getattr(event.severity, 'value', event.severity)}</b></font> "
                f"&nbsp;|&nbsp; {ts} &nbsp;|&nbsp; {event.description or ''}",
                caption_style,
            )
            elements.append(KeepTogether([img, caption]))
    else:
        elements.append(Paragraph("No incident screenshots recorded.", styles["Normal"]))

    doc.build(elements)
    return buf.getvalue()
