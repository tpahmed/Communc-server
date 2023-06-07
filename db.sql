-- Create the Accounts table
CREATE TABLE Accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) UNIQUE,
    fname VARCHAR(255),
    lname VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    password VARCHAR(255),
    image TEXT,
    language VARCHAR(4),
    theme VARCHAR(20),
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the Friends table
CREATE TABLE Friends (
    f1 INT REFERENCES Accounts(id),
    f2 INT REFERENCES Accounts(id),
    PRIMARY key (f1,f2),
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the Friend_Requests table
CREATE TABLE Friend_Requests (
    from_acc INT REFERENCES Accounts(id),
    to_acc INT REFERENCES Accounts(id),
    PRIMARY key (from_acc,to_acc),
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the Accounts_recovery table
CREATE TABLE Accounts_recovery (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email varchar(255),
    code VARCHAR(8),
    used boolean DEFAULT false,
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the Projects table
CREATE TABLE Projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    color VARCHAR(255),
    data_dictionary JSON,
    git_repository VARCHAR(255) UNIQUE,
    figma_url VARCHAR(255),
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the Tasks table
CREATE TABLE Tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    Description TEXT,
    assigned_to INT REFERENCES Accounts(id),
    assigning_day DATE,
    duration_in_day INT,
    difficulty INT CHECK (difficulty >= 1 AND difficulty <= 100),
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    
);

-- Create the Account_Projects table
CREATE TABLE Account_Projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    participent INT REFERENCES Accounts(id),
    project INT  REFERENCES Projects(id),
    role VARCHAR(255) DEFAULT 'member',
    UNIQUE(participent, project)
);

-- Create the Conversation table
CREATE TABLE Conversation (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255),
    image VARCHAR(255),
    type VARCHAR(255),
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the Conversation_Participent table
CREATE TABLE Conversation_Participent (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation INT REFERENCES Conversation(id),
    participent INT REFERENCES Accounts(id),
    role VARCHAR(255),
    unique (conversation, participent),
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the Conversation_Message table
CREATE TABLE Conversation_Message (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(255),
    content TEXT,
    Autor INT REFERENCES Conversation_Participent(id),
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
