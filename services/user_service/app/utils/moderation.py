BLOCKED_WORDS = [
    "abuse", "hate", "kill", "violence", "porn", "drugs",
]

def moderate_content(text):
    lower = text.lower()
    for word in BLOCKED_WORDS:
        if word in lower:
            return False, "Message contains inappropriate content"
    return True, None
