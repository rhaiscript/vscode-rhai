let a = 1 === 1;        
let b = 1 !== 1;        
let c = a -> b;        
x := 1;                 
let d = a <- 1;         
let e = 'ab';           
let f = 1 £ 2;          
let g = 0xZZ;          
(* old comment *)       
let s = "\q";
let c = ''; 

// Valid
let x = 1;
let m = #{ v: 2 };
let s = `a ${ m.v } b ${ `nested ${x}` } c ${ if x > 0 { "pos" } else { "neg" } }`;
let t = "${not interpolated}";