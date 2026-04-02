INSERT INTO transactions (user_id, description, amount, type, category, date) VALUES
(1, 'Salary', 50000, 'income', 'Salary', '2026-03-01'),
(1, 'Groceries', 2000, 'expense', 'Food', '2026-03-02'),
(1, 'Freelance Work', 15000, 'income', 'Freelance', '2026-03-03'),
(1, 'Electric Bill', 3000, 'expense', 'Utilities', '2026-03-04'),
(1, 'Movie', 800, 'expense', 'Entertainment', '2026-03-05'),
(1, 'Investment Return', 10000, 'income', 'Investment', '2026-03-06'),
(1, 'Petrol', 2500, 'expense', 'Transport', '2026-03-07'),
(1, 'Bonus', 20000, 'income', 'Salary', '2026-03-08'),
(1, 'Dining Out', 1800, 'expense', 'Food', '2026-03-09'),
(1, 'Shopping', 5000, 'expense', 'Shopping', '2026-03-10');

INSERT INTO budgets (user_id, category, limit_amount) VALUES
(1, 'Food', 8000),
(1, 'Transport', 5000),
(1, 'Entertainment', 4000),
(1, 'Utilities', 6000),
(1, 'Shopping', 7000),
(1, 'Health', 3000),
(1, 'Education', 10000),
(1, 'Travel', 15000),
(1, 'Investment', 20000);


INSERT INTO loans (user_id, name, type, amount, remain_amount) VALUES
(1, 'Personal Loan', 'borrowed', 50000, 40000),
(1, 'Friend Loan', 'lent', 10000, 8000),
(1, 'Car Loan', 'borrowed', 200000, 180000),
(1, 'Office Loan', 'lent', 15000, 13000),
(1, 'Education Loan', 'borrowed', 300000, 278000),
(1, 'Family Loan', 'lent', 25000, 22800),
(1, 'Gold Loan', 'borrowed', 80000, 67000),
(1, 'Business Loan', 'borrowed', 500000, 432987),
(1, 'Friend Loan', 'lent', 12000, 9990),
(1, 'Personal Loan', 'borrowed', 40000, 36700);


INSERT INTO goals (user_id, name, target_amount, saved_amount) VALUES
(1, 'Buy Laptop', 80000, 20000),
(1, 'Vacation', 50000, 15000),
(1, 'Emergency Fund', 100000, 40000),
(1, 'New Bike', 70000, 25000),
(1, 'House Down Payment', 500000, 100000),
(1, 'Wedding Fund', 300000, 80000),
(1, 'Car Purchase', 600000, 150000),
(1, 'Education', 200000, 50000),
(1, 'Travel Abroad', 250000, 70000),
(1, 'Start Business', 400000, 120000);
