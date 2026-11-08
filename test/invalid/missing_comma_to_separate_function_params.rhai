fn fib(num{
    if num < 2 {
        num
    } else {
        fib(num-1) + fib(num - 2)
    }
}