use std::time::Instant;

fn main() {
    let path = std::env::args().nth(1).unwrap();
    let stopwatch = Instant::now();
    let sides = sievemc::get_many_mod_file_sides(path).unwrap();
    let elapsed = stopwatch.elapsed();
    let max_width = sides
        .keys()
        .map(|p| format!("{p:?}").len())
        .max()
        .unwrap_or(0);
    for (path, side) in sides {
        println!("{:<max_width$}  {side:?}", format!("{path:?}"));
    }
    println!("Total time: {:?}", elapsed);
}
