from pathlib import Path
import shutil

import qrcode
from qrcode.constants import ERROR_CORRECT_H
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = Path(r"D:\CodexData\outputs")
TEMP_DIR = Path(r"D:\CodexData\temp\school-meal-poster")
PDF_PATH = OUTPUT_DIR / "seoun-pick-a4-campaign-poster.pdf"
REPO_PDF_PATH = ROOT / "assets" / "seoun-pick-a4-campaign-poster.pdf"
LOGO_PATH = ROOT / "assets" / "seoun-official-logo.png"

MEAL_URL = "https://dohoon819.github.io/school-meal-vote/?tab=meal#ideas"
OPINION_URL = "https://dohoon819.github.io/school-meal-vote/?tab=opinion#topOpinions"

INK = HexColor("#17210F")
GREEN = HexColor("#315E24")
GREEN_DARK = HexColor("#1E3E1B")
LIME = HexColor("#CFEA79")
CREAM = HexColor("#F7F0DC")
PAPER = HexColor("#FFFDF7")
BLUE = HexColor("#DCEAF8")
MUTED = HexColor("#64705F")
RED = HexColor("#D85F4B")


def qr_image(url: str, destination: Path, foreground: str) -> None:
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_H,
        box_size=24,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    qr.make_image(fill_color=foreground, back_color="white").save(destination)


def rounded_box(c, x, y, width, height, radius, fill, stroke=None, line_width=1):
    c.setFillColor(fill)
    c.setStrokeColor(stroke or fill)
    c.setLineWidth(line_width)
    c.roundRect(x, y, width, height, radius, fill=1, stroke=1 if stroke else 0)


def text(c, value, x, y, size, color=INK, font="Malgun", centered=False):
    c.setFont(font, size)
    c.setFillColor(color)
    if centered:
        c.drawCentredString(x, y, value)
    else:
        c.drawString(x, y, value)


def create_poster() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

    pdfmetrics.registerFont(TTFont("Malgun", r"C:\Windows\Fonts\malgun.ttf"))
    pdfmetrics.registerFont(TTFont("MalgunBold", r"C:\Windows\Fonts\malgunbd.ttf"))

    meal_qr = TEMP_DIR / "meal-qr-print.png"
    opinion_qr = TEMP_DIR / "opinion-qr-print.png"
    qr_image(MEAL_URL, meal_qr, "#1E3E1B")
    qr_image(OPINION_URL, opinion_qr, "#243B67")

    width, height = A4
    c = canvas.Canvas(str(PDF_PATH), pagesize=A4, pageCompression=1)
    c.setTitle("서운픽 - 전교 학생회 부회장 공약 A4 포스터")
    c.setAuthor("서운픽")

    c.setFillColor(CREAM)
    c.rect(0, 0, width, height, fill=1, stroke=0)

    # Decorative background shapes.
    c.setFillColor(HexColor("#E8F2BD"))
    c.circle(width - 45, height - 75, 115, fill=1, stroke=0)
    c.setFillColor(HexColor("#E5EDF5"))
    c.circle(12, 415, 72, fill=1, stroke=0)

    # Official school logo and campaign badge.
    rounded_box(c, 36, height - 69, 190, 42, 12, white)
    c.drawImage(str(LOGO_PATH), 49, height - 59, width=164, height=31, preserveAspectRatio=True, mask="auto")
    rounded_box(c, width - 210, height - 61, 174, 29, 15, GREEN_DARK)
    text(c, "전교 학생회 부회장 공약", width - 123, height - 51, 11, white, "MalgunBold", centered=True)

    # Main headline.
    text(c, "우리 학교,", 43, height - 128, 34, INK, "MalgunBold")
    text(c, "우리의 한 표로.", 43, height - 178, 45, GREEN, "MalgunBold")
    text(c, "언제나 쉽게 의견을 내고 투표하세요.", 44, height - 210, 14, INK, "MalgunBold")
    text(c, "투표 결과는 매주 공개되고, 가장 많은 선택은 TOP 5가 됩니다.", 44, height - 232, 10.8, MUTED)

    # Promise statement panel.
    rounded_box(c, 36, 444, width - 72, 130, 25, GREEN_DARK)
    text(c, "학생의 선택이", 58, 535, 14, LIME, "MalgunBold")
    text(c, "진짜 급식으로,", 58, 503, 25, white, "MalgunBold")
    text(c, "학교의 변화로.", 58, 473, 25, white, "MalgunBold")
    text(c, "메뉴부터 학생 의견까지 언제나 열려 있어요.", 58, 452, 9.5, HexColor("#E4EEDB"))

    chips = [
        ("투표권", "2표"),
        ("순위 공개", "TOP 5"),
        ("참여 방법", "QR 한 번"),
    ]
    chip_x = 350
    for index, (label, value) in enumerate(chips):
        y = 527 - index * 35
        rounded_box(c, chip_x, y, 178, 27, 13, HexColor("#3D6534"))
        text(c, label, chip_x + 14, y + 9, 8.5, HexColor("#DDE8D3"), "MalgunBold")
        text(c, value, chip_x + 164, y + 8, 10.5, white, "MalgunBold", centered=False)

    # QR cards.
    card_y = 161
    card_h = 252
    gap = 17
    card_w = (width - 72 - gap) / 2
    left_x = 36
    right_x = left_x + card_w + gap

    def qr_card(x, fill, badge, title, caption, qr_path, accent):
        rounded_box(c, x, card_y, card_w, card_h, 23, fill)
        rounded_box(c, x + 18, card_y + card_h - 39, 75, 22, 11, white)
        text(c, badge, x + 55.5, card_y + card_h - 31.5, 8.5, accent, "MalgunBold", centered=True)
        text(c, title, x + 18, card_y + card_h - 70, 20, accent, "MalgunBold")
        text(c, caption, x + 18, card_y + card_h - 89, 8.6, MUTED)
        qr_size = 138
        qr_x = x + (card_w - qr_size) / 2
        qr_y = card_y + 7
        rounded_box(c, qr_x - 7, qr_y - 7, qr_size + 14, qr_size + 14, 15, white)
        c.drawImage(str(qr_path), qr_x, qr_y, width=qr_size, height=qr_size, preserveAspectRatio=True, mask="auto")
        return qr_x, qr_y, qr_size

    meal_box = qr_card(left_x, LIME, "급식 메뉴", "먹고 싶은 메뉴", "메뉴를 제안하고 친구들과 투표", meal_qr, GREEN_DARK)
    opinion_box = qr_card(right_x, BLUE, "학생 의견", "우리 학교 의견", "의견을 내고 학생 TOP 5에 투표", opinion_qr, HexColor("#243B67"))

    # Bottom call to action.
    text(c, "지금 휴대전화 카메라를 켜고 참여하세요", width / 2, 118, 16, INK, "MalgunBold", centered=True)
    text(c, "가입 없이 간단하게 · 내가 낸 의견은 내가 삭제 · 학생 한 명당 투표권 2표", width / 2, 93, 9.5, MUTED, centered=True)
    rounded_box(c, 96, 43, width - 192, 32, 16, INK)
    text(c, "dohoon819.github.io/school-meal-vote", width / 2, 54, 10.5, white, "MalgunBold", centered=True)

    c.showPage()
    c.save()

    # Keep a deployable copy in the website repository.
    shutil.copy2(PDF_PATH, REPO_PDF_PATH)

    reader = PdfReader(str(PDF_PATH))
    if len(reader.pages) != 1:
        raise RuntimeError("Poster PDF must have exactly one page")
    media = reader.pages[0].mediabox
    actual = (round(float(media.width), 2), round(float(media.height), 2))
    expected = (round(A4[0], 2), round(A4[1], 2))
    if actual != expected:
        raise RuntimeError(f"Unexpected page size: {actual}, expected {expected}")

    print(PDF_PATH)
    print(REPO_PDF_PATH)
    print(f"MEAL_QR_BOX={meal_box}")
    print(f"OPINION_QR_BOX={opinion_box}")


if __name__ == "__main__":
    create_poster()
