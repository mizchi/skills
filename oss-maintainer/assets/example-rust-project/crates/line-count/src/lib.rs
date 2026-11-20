/// Count non-empty lines. A line containing only spaces still counts.
pub fn count_nonempty(text: &str) -> usize {
    text.lines().filter(|line| !line.is_empty()).count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn handles_empty_lines_crlf_and_spaces() {
        assert_eq!(count_nonempty(""), 0);
        assert_eq!(count_nonempty("alpha\r\n\r\n \nbeta\n"), 3);
    }
}
