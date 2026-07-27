use std::time::Instant;

fn main() {
    let stopwatch = Instant::now();
    let path = std::env::args().nth(1).unwrap();
    let sides = sievemc::fabric::get_many_mod_file_sides(path).unwrap();
    let max_width = sides
        .keys()
        .map(|p| format!("{p:?}").len())
        .max()
        .unwrap_or(0);
    let elapsed = stopwatch.elapsed();
    for (path, side) in sides {
        println!("{:<max_width$}  {side:?}", format!("{path:?}"));
    }
    println!("Total time: {:?}", elapsed);
}
