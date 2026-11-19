// In array so that we can use ... to spread the object into pipelines
export const withTeacherPipeline = [
  {
    $lookup: {
      from: "teachers",
      localField: "teacherId",
      foreignField: "_id",
      as: "teacher",
    },
  },
  {
    $unwind: { path: "$teacher", preserveNullAndEmptyArrays: true },
  },
  {
    $project: {
      _id: 1,
      startTime: 1,
      endTime: 1,
      status: 1,
      teacher: {
        _id: "$teacher._id",
        fullName: "$teacher.fullName",
        email: "$teacher.email",
      },
    },
  },
];
