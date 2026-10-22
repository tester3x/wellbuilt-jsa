# Pending delivery audit

Standalone create/close/append requests now require the exact owner-bound server record before pending removal. Append requires its addition identity and close requires closed state. Governed artifact queues already retain failed/blocked requests. Eleven durable addition/receipt cases pass, including restart and incomplete/wrong-owner responses. Source checkpoint only; not built or installed.
