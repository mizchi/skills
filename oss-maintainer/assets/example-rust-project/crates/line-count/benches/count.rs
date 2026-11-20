use criterion::{Criterion, criterion_group, criterion_main};
use line_count::count_nonempty;
use std::hint::black_box;

fn benchmark(c: &mut Criterion) {
    let input = "alpha\n\nbeta\r\n".repeat(256);
    c.bench_function("count mixed lines", |b| {
        b.iter(|| count_nonempty(black_box(&input)))
    });
}

criterion_group!(benches, benchmark);
criterion_main!(benches);
